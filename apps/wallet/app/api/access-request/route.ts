import { createHmac } from "node:crypto";
import { looksAutomated } from "@wallet/lib/access-requests/rules";
import { baseURL } from "@wallet/lib/auth/config";
import { insertAccessRequest } from "@wallet/lib/db/access-requests";
import { accessRequestSchema } from "@wallet/lib/validation/access-request";
import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { logger } from "@/lib/log";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { fromZod } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

// „Zugang anfragen“ (Startseite #zugang). Nur JSON von der eigenen Herkunft
// (eine fremde Seite kann nicht in fremdem Namen posten, JSON erzwingt den
// CORS-Preflight), 5 Anfragen je IP in 10 Minuten. Honeypot und Mindestzeit
// verwerfen still mit derselben Antwort wie ein Erfolg. Keine Mail an die
// angegebene Adresse: das Formular soll kein Mail-Relay sein. Die Meldung an
// den Betrieb verschickt der Job notification-mail.

const perIp = new SlidingWindowLimiter(5, 10 * 60_000);
const MAX_BODY = 16_384;

const json = (status: number, body: unknown) =>
	NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

const accepted = () =>
	new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});

// Schlüssel wie Better Auth (lib/auth/server.ts); die Start-Prüfung verlangt
// ihn in Produktion, fehlt er, scheitert die Anfrage (fail closed)
function hashIp(ip: string): string {
	const secret = process.env.WALLET_AUTH_SECRET;
	if (!secret) throw new Error("WALLET_AUTH_SECRET fehlt");
	return createHmac("sha256", secret)
		.update(`access-request:${ip}`)
		.digest("hex")
		.slice(0, 32);
}

export async function POST(req: Request) {
	if (
		!req.headers.get("content-type")?.startsWith("application/json") ||
		req.headers.get("origin") !== new URL(baseURL).origin
	)
		return json(403, { error: "forbidden" });
	const ip = ipFromHeaders(req.headers) ?? "unknown";
	if (!perIp.check(ip).allowed) return json(429, { error: "rate_limited" });
	// Ein Formular passt in wenige KB; mehr wird nicht erst geparst
	const raw = await req.text().catch(() => "");
	if (raw.length > MAX_BODY) return json(413, { error: "too_large" });
	let body: Record<string, unknown> | null = null;
	try {
		body = JSON.parse(raw) as Record<string, unknown> | null;
	} catch {
		body = null;
	}
	if (!body || typeof body !== "object" || Array.isArray(body))
		return json(400, { error: "invalid" });
	if (
		looksAutomated({
			website: typeof body.website === "string" ? body.website : null,
			renderedAt: typeof body.renderedAt === "number" ? body.renderedAt : null,
		})
	) {
		logger.info({ route: "access-request" }, "access request dropped");
		return accepted();
	}
	const parsed = accessRequestSchema.safeParse(body);
	if (!parsed.success) {
		const r = fromZod(parsed.error);
		return json(400, {
			error: "invalid",
			fieldErrors: r.ok ? {} : (r.fieldErrors ?? {}),
		});
	}
	const d = parsed.data;
	try {
		await insertAccessRequest({
			name: d.name,
			company: d.company,
			email: d.email,
			purpose: d.purpose,
			message: d.message,
			ipHash: hashIp(ip),
		});
	} catch (err) {
		logger.error({ err, route: "access-request" }, "access request failed");
		return json(500, { error: "error" });
	}
	return accepted();
}
