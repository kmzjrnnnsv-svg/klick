import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { accessTokens } from "@/db/schema";
import type { IngestScope } from "@/db/schema/enums";
import type { OrgCtx, OrgTx } from "@/lib/db/with-org";
import { type ResolvedToken, resolveToken } from "@/lib/db/with-token";
import { logger } from "@/lib/log";
import { getOrgLimiter, SlidingWindowLimiter } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/validate";
import { bearerToken, hasScopes } from "./tokens";

// Gemeinsame Bausteine der Ingest-API (/api/ingest/*): nur Bearer-Token
// (ADR-017), keine Cookies; Grenzen je IP, je Token und je Org; Body höchstens
// 25 MB, gestreamt gelesen. Antworten sind JSON ohne interne Details.

const perIp = new SlidingWindowLimiter(60, 60_000);
const perToken = new SlidingWindowLimiter(30, 60_000);

const json = (
	status: number,
	body: Record<string, unknown>,
	headers?: HeadersInit,
) =>
	NextResponse.json(body, {
		status,
		headers: { "cache-control": "no-store", ...headers },
	});

export function clientIp(req: Request): string {
	return (
		req.headers.get("x-real-ip") ??
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}

export async function ingestAuth(
	req: Request,
	scope: IngestScope,
): Promise<{ token: ResolvedToken; ctx: OrgCtx } | NextResponse> {
	const ip = clientIp(req);
	const ipDecision = perIp.check(ip);
	if (!ipDecision.allowed)
		return json(
			429,
			{ error: "rate_limited" },
			{
				"retry-after": String(Math.ceil(ipDecision.retryAfterMs / 1000)),
			},
		);
	const raw = bearerToken(req.headers.get("authorization"));
	if (!raw)
		return json(
			401,
			{ error: "unauthorized" },
			{ "www-authenticate": "Bearer" },
		);
	const r = await resolveToken(raw, "ingest");
	if (!r.ok)
		return json(
			401,
			{ error: r.error === "invalid" ? "unauthorized" : `token_${r.error}` },
			{
				"www-authenticate": "Bearer",
			},
		);
	if (!hasScopes(r.token.scopes, [scope]))
		return json(403, { error: "scope_missing", scope });
	const t = perToken.check(r.token.id);
	if (!t.allowed || !getOrgLimiter().check(r.token.organizationId).allowed)
		return json(
			429,
			{ error: "rate_limited" },
			{
				"retry-after": String(Math.max(1, Math.ceil(t.retryAfterMs / 1000))),
			},
		);
	return {
		token: r.token,
		ctx: {
			orgId: r.token.organizationId,
			userId: null,
			ip,
			userAgent: req.headers.get("user-agent"),
		},
	};
}

// Body gestreamt mit harter Grenze lesen; nur UTF-8-Text.
export async function readTextBody(
	req: Request,
	max = MAX_UPLOAD_BYTES,
): Promise<{ text: string; bytes: Uint8Array } | NextResponse> {
	const declared = Number(req.headers.get("content-length") ?? 0);
	if (declared > max) return json(413, { error: "too_large", max });
	if (!req.body) return json(400, { error: "empty" });
	const reader = req.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel();
			return json(413, { error: "too_large", max });
		}
		chunks.push(value);
	}
	if (size === 0) return json(400, { error: "empty" });
	const bytes = new Uint8Array(size);
	let o = 0;
	for (const c of chunks) {
		bytes.set(c, o);
		o += c.byteLength;
	}
	try {
		return {
			text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
			bytes,
		};
	} catch {
		return json(400, { error: "invalid_text" });
	}
}

export async function touchToken(
	tx: OrgTx,
	tokenId: string,
	ip: string | null,
) {
	await tx
		.update(accessTokens)
		.set({ lastUsedAt: new Date(), lastUsedIp: ip })
		.where(eq(accessTokens.id, tokenId));
}

// Unerwartete Fehler: JSON mit Referenz statt HTML-500 (Referenz im Journal).
export function ingestRoute(
	name: string,
	handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
	return async (req) => {
		try {
			return await handler(req);
		} catch (err) {
			const ref = randomUUID().slice(0, 8);
			logger.error({ err, route: name, ref }, "ingest failed");
			return json(500, { error: "internal", ref });
		}
	};
}

export { json as ingestJson };
