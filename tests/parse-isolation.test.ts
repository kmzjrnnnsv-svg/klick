import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderPdf } from "@/lib/export/pdf";
import {
	parseIsolated,
	sbomResultSchema,
	screenResultSchema,
} from "@/lib/parse/client";
import {
	decodeRequest,
	decodeResponse,
	encodeRequest,
	encodeResponse,
	MAX_BODY,
	requestLength,
} from "@/lib/parse/protocol";
import { runJob } from "@/lib/parse/run";

const enc = (s: string) => new TextEncoder().encode(s);
const CSV = enc("name;iban\nErika;DE89370400440532013000\n");
const SBOM = enc(
	JSON.stringify({
		bomFormat: "CycloneDX",
		specVersion: "1.6",
		metadata: { component: { name: "app" } },
		components: [{ name: "lib", version: "1.0.0" }],
	}),
);

describe("Protokoll", () => {
	it("Rundreise Anfrage und Antwort", () => {
		const req = encodeRequest({ op: "screen", name: "a.csv" }, CSV);
		expect(requestLength(req)).toBe(req.length);
		const back = decodeRequest(req);
		expect(back?.job).toEqual({ op: "screen", name: "a.csv" });
		expect(Buffer.from(back?.body ?? []).equals(Buffer.from(CSV))).toBe(true);
		expect(decodeResponse(encodeResponse({ result: 1 }))).toEqual({
			result: 1,
		});
	});

	it("lehnt zu große, abgeschnittene und fremde Anfragen ab", () => {
		const big = Buffer.alloc(8);
		big.writeUInt32BE(10, 0);
		big.writeUInt32BE(MAX_BODY + 1, 4);
		expect(requestLength(big)).toBe(-1);
		const req = encodeRequest({ op: "sbom" }, SBOM);
		expect(decodeRequest(req.subarray(0, req.length - 1))).toBeNull();
		const evil = encodeRequest({ op: "sbom" }, SBOM);
		evil.write('{"op":"exec"}'.padEnd(evil.readUInt32BE(0)), 8);
		expect(decodeRequest(evil)).toBeNull();
	});
});

describe("Parser-Aufgaben", () => {
	it("screen: Typ, Text und DLP-Treffer, nie der Text selbst", async () => {
		const r = screenResultSchema.parse(
			await runJob({ op: "screen", name: "liste.csv" }, CSV),
		);
		expect(r.validation.ok).toBe(true);
		expect(r.findings?.some((f) => f.detector === "iban")).toBe(true);
		expect(JSON.stringify(r)).not.toContain("DE8937");
	});

	it("screen mit withText: Text kommt nur auf Anfrage zurück", async () => {
		const r = screenResultSchema.parse(
			await runJob({ op: "screen", name: "liste.csv", withText: true }, CSV),
		);
		expect(r.text).toContain("DE89370400440532013000");
	});

	it("screen: PDF wird gelesen und auf DLP geprüft", async () => {
		const pdf = renderPdf(
			{
				title: "Vertrag",
				org: "Muster GmbH",
				meta: [],
				blocks: [
					{
						type: "paragraph",
						text: "Zahlung an IBAN DE89370400440532013000.",
					},
				],
			},
			{ now: new Date("2026-10-29T08:00:00Z") },
		);
		const r = screenResultSchema.parse(
			await runJob({ op: "screen", name: "vertrag.pdf" }, pdf),
		);
		expect(r.extraction?.status).toBe("ok");
		expect(r.findings?.some((f) => f.detector === "iban")).toBe(true);
		expect(r.text).toBeUndefined();
		const enc = screenResultSchema.parse(
			await runJob(
				{ op: "screen", name: "geheim.pdf", withText: true },
				new Uint8Array(
					readFileSync(path.join(__dirname, "fixtures/pdf/encrypted.pdf")),
				),
			),
		);
		expect(enc.extraction).toEqual({
			status: "unsupported",
			reason: "encrypted",
		});
		expect(enc.text).toBeUndefined();
	});

	it("sbom: CycloneDX erkannt, kaputtes UTF-8 abgelehnt", async () => {
		const ok = sbomResultSchema.parse(await runJob({ op: "sbom" }, SBOM));
		expect(ok.ok && ok.sbom.format).toBe("cyclonedx");
		const bad = sbomResultSchema.parse(
			await runJob({ op: "sbom" }, new Uint8Array([0xff, 0xfe, 0x00])),
		);
		expect(bad).toEqual({ ok: false, error: "invalid_json" });
	});

	it("Ergebnis-Schema lässt nichts Fremdes durch", () => {
		expect(
			screenResultSchema.safeParse({
				validation: { ok: true, mime: "x", ext: "x", safeName: "x", size: 1 },
				findings: [{ detector: "x", category: "steal", count: 1 }],
			}).success,
		).toBe(false);
	});
});

describe("eigener Prozess", () => {
	it("Kindprozess parst und antwortet", async () => {
		const r = await parseIsolated({ op: "sbom" }, SBOM, sbomResultSchema);
		expect(r.ok && r.data.ok && r.data.sbom.components.length).toBe(1);
	}, 30_000);

	it("Zeitgrenze: Prozess wird beendet, Upload abgelehnt", async () => {
		const r = await parseIsolated({ op: "sbom" }, SBOM, sbomResultSchema, {
			timeoutMs: 5,
		});
		expect(r).toEqual({ ok: false, error: "parser_timeout" });
	});
});

describe("Socket wie systemd (Accept=yes)", () => {
	it("je Verbindung ein Prozess, Socket als stdin/stdout", async () => {
		const dir = mkdtempSync(path.join(tmpdir(), "klick-parse-"));
		const sock = path.join(dir, "parse.sock");
		const server = createServer((conn) => {
			spawn(
				process.execPath,
				["--import", "tsx", path.join(process.cwd(), "lib/parse/worker.ts")],
				{
					stdio: [conn, conn, "ignore"],
					env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
				},
			).on("close", () => conn.destroy());
		});
		await new Promise<void>((r) => server.listen(sock, r));
		vi.stubEnv("PARSER_SOCKET", sock);
		try {
			const r = await parseIsolated(
				{ op: "screen", name: "liste.csv" },
				CSV,
				screenResultSchema,
			);
			expect(r.ok && r.data.findings?.[0]?.detector).toBe("iban");
			vi.stubEnv("PARSER_SOCKET", path.join(dir, "fehlt.sock"));
			expect(
				await parseIsolated({ op: "sbom" }, SBOM, sbomResultSchema),
			).toEqual({ ok: false, error: "parser_unavailable" });
		} finally {
			vi.unstubAllEnvs();
			server.close();
		}
	}, 30_000);
});

// Nur der Parser-Prozess (lib/parse/run.ts) ruft die Parser auf — sonst
// liefe fremder Dateiinhalt wieder im App-Prozess.
describe("Grenze", () => {
	it("App-Code ruft Parser nur über parseIsolated", () => {
		const PARSERS =
			/\b(validateUpload|extractText|readZipEntries|parseSbom|parseScanFile)\b/;
		const OWN = new Set([
			"lib/parse/run.ts",
			"lib/uploads/validate.ts",
			"lib/uploads/zip-read.ts",
			"lib/dlp/extract.ts",
			"lib/security/parsers.ts",
			"lib/security/sbom-check.ts",
		]);
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const e of readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) walk(p);
				else if (/\.tsx?$/.test(e.name) && !OWN.has(p))
					if (PARSERS.test(readFileSync(p, "utf8"))) offenders.push(p);
			}
		};
		for (const d of ["app", "lib", "components"]) walk(d);
		expect(offenders).toEqual([]);
	});
});
