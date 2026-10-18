import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { insertInquiry } from "@/lib/db/inquiries";
import { env } from "@/lib/env";
import { looksAutomated } from "@/lib/inquiries/rules";
import { logger } from "@/lib/log";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";
import { fromZod } from "@/lib/validation/common";
import { publicInquirySchema } from "@/lib/validation/inquiry";

export const dynamic = "force-dynamic";

// Öffentliches Anfrageformular (/leistungen#anfrage). Nur JSON von der
// eigenen Herkunft (eine fremde Seite kann nicht in fremdem Namen posten,
// JSON erzwingt den CORS-Preflight), 5 Anfragen je IP in 10 Minuten.
// Honeypot und Mindestzeit verwerfen still mit derselben Antwort wie ein
// Erfolg. Keine Bestätigungsmail an die angegebene Adresse — das Formular
// soll kein Mail-Relay sein.

const perIp = new SlidingWindowLimiter(5, 10 * 60_000);

const hashIp = (ip: string) =>
	createHmac("sha256", env().BETTER_AUTH_SECRET)
		.update(`inquiry:${ip}`)
		.digest("hex")
		.slice(0, 32);

const accepted = () =>
	new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});

export const POST = ingestRoute("inquiry.public", async (req: Request) => {
	const origin = req.headers.get("origin");
	if (
		!req.headers.get("content-type")?.startsWith("application/json") ||
		origin !== new URL(env().BETTER_AUTH_URL).origin
	)
		return ingestJson(403, { error: "forbidden" });
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	const body = (await req.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;
	if (!body) return ingestJson(400, { error: "invalid" });
	if (
		looksAutomated({
			website: typeof body.website === "string" ? body.website : null,
			renderedAt: typeof body.renderedAt === "number" ? body.renderedAt : null,
		})
	) {
		logger.info({ route: "inquiry.public" }, "inquiry dropped (bot check)");
		return accepted();
	}
	const parsed = publicInquirySchema.safeParse(body);
	if (!parsed.success) {
		const r = fromZod(parsed.error);
		return ingestJson(400, {
			error: "invalid",
			fieldErrors: r.ok ? {} : (r.fieldErrors ?? {}),
		});
	}
	const d = parsed.data;
	await insertInquiry({
		source: "public",
		serviceKey: d.service,
		name: d.name,
		company: d.company,
		email: d.email,
		phone: d.phone,
		message: d.message,
		context: { page: "/leistungen" },
		ipHash: hashIp(ip),
	});
	return accepted();
});
