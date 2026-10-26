import { randomUUID } from "node:crypto";
import {
	confirmOrigin,
	SignerCallError,
	signerCall,
} from "@wallet/lib/wallet/signer/client";
import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { logger } from "@/lib/log";
import { SlidingWindowLimiter } from "@/lib/rate-limit";

// Relay zwischen Bestätigungsseite (approve.both.money) und Signer. both.money
// reicht nur weiter — prüfen tut der Signer (WebAuthn, Herkunft, Zähler).
// Öffentlich ohne Sitzung: die zufällige ID der Absicht, Einrichtung bzw.
// Vollmacht ist die Berechtigung. CORS nur für CONFIRM_ORIGIN, keine Cookies,
// höchstens 16 KB, Ratengrenze je IP und je ID, nur bekannte Felder.

const HEX_ID = /^[0-9a-f]{32}$/;
const UUID_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 16 * 1024;
const perIp = new SlidingWindowLimiter(60, 60_000);
const perId = new SlidingWindowLimiter(20, 60_000);

export type RelayKind = "bestaetigung" | "einrichtung" | "vollmacht";

const SPEC = {
	bestaetigung: {
		key: "intentId",
		id: HEX_ID,
		get: "intent.get",
		post: "approve",
		fields: ["credId", "authenticatorData", "clientDataJSON", "signature"],
	},
	einrichtung: {
		key: "enrolId",
		id: HEX_ID,
		get: "enrol.info",
		post: "enrol.finish",
		fields: ["credId", "spki", "authenticatorData", "clientDataJSON", "mac"],
	},
	// Vollmacht (Härtung W): der Signer gibt sie über das Quorum frei
	vollmacht: {
		key: "mandateId",
		id: UUID_ID,
		get: "mandate.get",
		post: "mandate.approve",
		fields: ["credId", "authenticatorData", "clientDataJSON", "signature"],
	},
} as const;

export function corsHeaders(
	origin: string | null,
): Record<string, string> | null {
	const allowed = confirmOrigin();
	if (!allowed || origin !== allowed) return null;
	return {
		"access-control-allow-origin": allowed,
		"access-control-allow-methods": "GET, POST",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "600",
		vary: "Origin",
	};
}

const reply = (
	status: number,
	body: unknown,
	cors: Record<string, string> | null,
) =>
	NextResponse.json(body, {
		status,
		headers: { "cache-control": "no-store", ...(cors ?? {}) },
	});

// nur bekannte Felder, nur base64url-Text in vernünftiger Länge
export function pickFields(
	kind: RelayKind,
	body: unknown,
): Record<string, string> | null {
	if (!body || typeof body !== "object" || Array.isArray(body)) return null;
	const out: Record<string, string> = {};
	for (const f of SPEC[kind].fields) {
		const v = (body as Record<string, unknown>)[f];
		if (typeof v !== "string" || v.length === 0 || v.length > 4096) return null;
		if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
		out[f] = v;
	}
	return out;
}

export function relayRoute(kind: RelayKind) {
	const spec = SPEC[kind];
	const handle =
		(method: "GET" | "POST") =>
		async (
			req: Request,
			{ params }: { params: Promise<{ id: string }> },
		): Promise<Response> => {
			const cors = corsHeaders(req.headers.get("origin"));
			if (!cors)
				return reply(403, { ok: false, error: { code: "origin" } }, null);
			try {
				const { id } = await params;
				if (!spec.id.test(id))
					return reply(404, { ok: false, error: { code: "not_found" } }, cors);
				if (
					!perIp.check(ipFromHeaders(req.headers) ?? "unknown").allowed ||
					!perId.check(`${kind}:${id}`).allowed
				)
					return reply(
						429,
						{ ok: false, error: { code: "rate_limited" } },
						cors,
					);
				let args: Record<string, string> = { [spec.key]: id };
				if (method === "POST") {
					if (!req.headers.get("content-type")?.startsWith("application/json"))
						return reply(
							415,
							{ ok: false, error: { code: "bad_request" } },
							cors,
						);
					const text = await req.text();
					if (text.length > MAX_BODY)
						return reply(
							413,
							{ ok: false, error: { code: "bad_request" } },
							cors,
						);
					let body: unknown;
					try {
						body = JSON.parse(text);
					} catch {
						return reply(
							400,
							{ ok: false, error: { code: "bad_request" } },
							cors,
						);
					}
					const fields = pickFields(kind, body);
					if (!fields)
						return reply(
							400,
							{ ok: false, error: { code: "bad_request" } },
							cors,
						);
					args = { ...args, ...fields };
				}
				const r = await signerCall(
					method === "GET" ? spec.get : spec.post,
					args,
				);
				return reply(200, { ok: true, result: r.result }, cors);
			} catch (e) {
				if (e instanceof SignerCallError) {
					if (e.code === "signer")
						return reply(
							422,
							{
								ok: false,
								error: {
									code: e.signerCode ?? "error",
									...(e.signerCode === "webauthn" && e.detail
										? { detail: e.detail }
										: {}),
								},
							},
							cors,
						);
					return reply(
						503,
						{ ok: false, error: { code: "unreachable" } },
						cors,
					);
				}
				const ref = randomUUID().slice(0, 8);
				logger.error(
					{ err: e, route: `wallet.relay.${kind}`, ref },
					"relay failed",
				);
				return reply(
					500,
					{ ok: false, error: { code: "internal", ref } },
					cors,
				);
			}
		};
	return {
		GET: handle("GET"),
		POST: handle("POST"),
		OPTIONS: async (req: Request) => {
			const cors = corsHeaders(req.headers.get("origin"));
			return cors
				? new NextResponse(null, { status: 204, headers: cors })
				: new NextResponse(null, { status: 403 });
		},
	};
}
