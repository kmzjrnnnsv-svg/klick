import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { z } from "zod";
import {
	FINDING_CATEGORIES,
	FINDING_SEVERITIES,
	SCAN_TOOLS,
} from "@/db/schema/enums";
import type { DlpCategory, DlpDetector } from "@/lib/dlp/detectors";
import type { ScanParseError } from "@/lib/security/parsers";
import type { SbomParseError } from "@/lib/security/sbom-check";
import { MAX_TEXT_CHARS } from "@/lib/uploads/limits";
import type { UploadValidation } from "@/lib/uploads/validate";
import {
	decodeResponse,
	encodeRequest,
	MAX_RESPONSE,
	type ParseJob,
} from "./protocol";

// Hochgeladene Dateien parst nie der App-Prozess (N6): jede Anfrage geht an
// einen eigenen Prozess — in Produktion über PARSER_SOCKET an den
// systemd-Dienst klick-parse (kein Netz, keine Zugangsdaten, Speicher- und
// Zeitgrenze), sonst als Kindprozess. Die Antwort gilt als nicht
// vertrauenswürdig und wird mit zod geprüft. Fehler → Upload abgelehnt.

export const PARSE_TIMEOUT_MS = 20_000;

export type ParseError =
	| "parser_unavailable"
	| "parser_timeout"
	| "parser_failed"
	| "parser_invalid";

// Nur bekannte Codes: der Worker kann keine Fehlerschlüssel oder Detektoren
// erfinden (Fehlertexte und Audit hängen daran).
const UPLOAD_REJECT_REASONS = [
	"too_large",
	"empty",
	"type_not_allowed",
	"signature_mismatch",
	"invalid_text",
] as const satisfies readonly Extract<
	UploadValidation,
	{ ok: false }
>["reason"][];
const DLP_DETECTORS = [
	"private_key",
	"aws_access_key",
	"stripe_secret",
	"github_token",
	"openai_key",
	"anthropic_key",
	"slack_token",
	"sendgrid_key",
	"supabase_service_role",
	"google_api_key",
	"card_number",
	"iban",
	"de_tax_id",
	"email",
	"phone",
] as const satisfies readonly DlpDetector[];
const DLP_CATEGORIES = [
	"secret",
	"payment",
	"bank",
	"tax",
	"pii",
	"info",
] as const satisfies readonly DlpCategory[];

const SBOM_PARSE_ERRORS = [
	"invalid_json",
	"unknown_format",
	"unsupported_version",
] as const satisfies readonly SbomParseError[];
const SCAN_PARSE_ERRORS = [
	"invalid_json",
	"unknown_format",
	"too_many",
] as const satisfies readonly ScanParseError[];

const short = (n: number) => z.string().max(n);
// Freitext aus fremden Berichten: kürzen statt ablehnen (Grenze für alles
// zusammen ist MAX_RESPONSE)
const clipped = (n: number) =>
	z.string().transform((v) => (v.length > n ? `${v.slice(0, n)}…` : v));
const clippedOrNull = (n: number) => clipped(n).nullable();

export const screenResultSchema = z.object({
	validation: z.union([
		z.object({
			ok: z.literal(true),
			mime: short(200),
			ext: short(20),
			safeName: short(300),
			size: z.number().int().nonnegative(),
		}),
		z.object({
			ok: z.literal(false),
			reason: z.enum(UPLOAD_REJECT_REASONS),
		}),
	]),
	extraction: z
		.object({
			status: z.enum(["ok", "unsupported", "error"]),
			truncated: z.boolean().optional(),
			reason: z.enum(["encrypted", "no_text"]).optional(),
		})
		.optional(),
	// nur mit withText: Text der Datei, ein Absatz je Zeile
	text: z.string().max(MAX_TEXT_CHARS).optional(),
	findings: z
		.array(
			z.object({
				detector: z.enum(DLP_DETECTORS),
				category: z.enum(DLP_CATEGORIES),
				count: z.number().int().nonnegative(),
			}),
		)
		.max(100)
		.optional(),
});

export const sbomResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		sbom: z.object({
			format: z.enum(["cyclonedx", "spdx"]),
			specVersion: clippedOrNull(40),
			generatedAt: clippedOrNull(60),
			creator: z.boolean(),
			primaryComponent: clippedOrNull(500),
			components: z
				.array(
					z.object({
						name: clipped(500),
						version: z.boolean(),
						identifier: z.boolean(),
						license: z.boolean(),
						hash: z.boolean(),
						supplier: z.boolean(),
					}),
				)
				.max(200_000),
			dependencies: z.boolean(),
		}),
	}),
	z.object({
		ok: z.literal(false),
		error: z.enum(SBOM_PARSE_ERRORS),
	}),
]);

export const scanResultSchema = z.union([
	z.object({
		ok: z.literal(true),
		scan: z.object({
			tool: z.enum(SCAN_TOOLS),
			toolName: clippedOrNull(200),
			target: clippedOrNull(2_000),
			findings: z
				.array(
					z.object({
						ruleId: clipped(500),
						title: clipped(1_000),
						severity: z.enum(FINDING_SEVERITIES),
						category: z.enum(FINDING_CATEGORIES),
						location: clippedOrNull(2_000),
						cwe: clippedOrNull(100),
						cve: clippedOrNull(100),
						cvss: z.number().nullable(),
						description: clippedOrNull(20_000),
						remediation: clippedOrNull(20_000),
						package: z
							.object({
								name: clipped(500),
								version: clippedOrNull(200),
								fixed: clippedOrNull(200),
							})
							.nullable(),
						evidence: clippedOrNull(2_000),
						toolFingerprint: clippedOrNull(500),
					}),
				)
				.max(50_000),
		}),
	}),
	z.object({
		ok: z.literal(false),
		error: z.enum(SCAN_PARSE_ERRORS),
	}),
]);

// Kindprozess: gebündelter Parser (pnpm build:parser), sonst über tsx
function workerCommand(): { cmd: string; args: string[] } {
	const bundled = path.join(process.cwd(), "dist", "parse-worker.mjs");
	const limits = [
		"--max-old-space-size=384",
		"--disallow-code-generation-from-strings",
	];
	if (existsSync(bundled))
		return { cmd: process.execPath, args: [...limits, bundled] };
	return {
		cmd: process.execPath,
		args: [
			...limits,
			"--import",
			"tsx",
			path.join(process.cwd(), "lib/parse/worker.ts"),
		],
	};
}

function exchange(request: Buffer, timeoutMs: number): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let done = false;
		const finish = (err: Error | null) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			cleanup();
			if (err) reject(err);
			else resolve(Buffer.concat(chunks));
		};
		const onData = (c: Buffer) => {
			size += c.length;
			if (size > MAX_RESPONSE + 4) return finish(new Error("parser_invalid"));
			chunks.push(c);
		};
		let cleanup = () => {};
		const timer = setTimeout(
			() => finish(new Error("parser_timeout")),
			timeoutMs,
		);
		const socketPath = process.env.PARSER_SOCKET;
		if (socketPath) {
			const sock = connect(socketPath);
			cleanup = () => sock.destroy();
			sock.on("error", () => finish(new Error("parser_unavailable")));
			sock.on("data", onData);
			sock.on("end", () => finish(null));
			sock.end(request);
			return;
		}
		const { cmd, args } = workerCommand();
		const child = spawn(cmd, args, {
			stdio: ["pipe", "pipe", "ignore"],
			// keine Zugangsdaten an den Parser
			env: {
				PATH: process.env.PATH ?? "",
				NODE_ENV: process.env.NODE_ENV ?? "",
			},
		});
		cleanup = () => child.kill("SIGKILL");
		child.on("error", () => finish(new Error("parser_unavailable")));
		child.stdout.on("data", onData);
		child.on("close", () => finish(null));
		child.stdin.on("error", () => {});
		child.stdin.end(request);
	});
}

export async function parseIsolated<T>(
	job: ParseJob,
	body: Uint8Array,
	schema: z.ZodType<T>,
	opts: { timeoutMs?: number } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: ParseError }> {
	let raw: Buffer;
	try {
		raw = await exchange(
			encodeRequest(job, body),
			opts.timeoutMs ?? PARSE_TIMEOUT_MS,
		);
	} catch (e) {
		const m = e instanceof Error ? e.message : "";
		return {
			ok: false,
			error:
				m === "parser_timeout" ||
				m === "parser_invalid" ||
				m === "parser_unavailable"
					? m
					: "parser_failed",
		};
	}
	let decoded: unknown;
	try {
		decoded = decodeResponse(raw);
	} catch {
		return {
			ok: false,
			error: raw.length === 0 ? "parser_failed" : "parser_invalid",
		};
	}
	const envelope = z
		.object({
			result: z.unknown().optional(),
			error: z.string().max(60).optional(),
		})
		.safeParse(decoded);
	if (
		!envelope.success ||
		envelope.data.error ||
		envelope.data.result === undefined
	)
		return { ok: false, error: "parser_failed" };
	const parsed = schema.safeParse(envelope.data.result);
	return parsed.success
		? { ok: true, data: parsed.data }
		: { ok: false, error: "parser_invalid" };
}
