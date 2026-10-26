import { NextResponse } from "next/server";
import { publicTrustCenter } from "@/lib/db/trust";
import { env } from "@/lib/env";
import { looksAutomated } from "@/lib/inquiries/rules";
import { logger } from "@/lib/log";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";
import { createTrustRequest } from "@/lib/trust/access";
import { fromZod } from "@/lib/validation/common";
import { trustRequestSchema } from "@/lib/validation/trust";

export const dynamic = "force-dynamic";

// Anfrage nach vertraulichen Unterlagen (/vertrauen/<slug>). Muster wie
// /api/anfrage: nur JSON von der eigenen Herkunft, 5 je IP in 10 Minuten,
// Honeypot und Mindestzeit verwerfen still. Die Org kommt aus dem
// veröffentlichten Slug, nie aus der Eingabe; keine Mail an die angegebene
// Adresse (erst die Freigabe darf eine schicken).

const perIp = new SlidingWindowLimiter(5, 10 * 60_000);

const accepted = () =>
	new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});

export const POST = ingestRoute("trust.request", async (req: Request) => {
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
		logger.info(
			{ route: "trust.request" },
			"trust request dropped (bot check)",
		);
		return accepted();
	}
	const parsed = trustRequestSchema.safeParse(body);
	if (!parsed.success) {
		const r = fromZod(parsed.error);
		return ingestJson(400, {
			error: "invalid",
			fieldErrors: r.ok ? {} : (r.fieldErrors ?? {}),
		});
	}
	const d = parsed.data;
	const center = await publicTrustCenter(d.slug);
	if (!center) return ingestJson(404, { error: "not_found" });
	// IP-Liste der Organisation (Härtung A5), außer ausgenommen
	if (
		!(await orgNetworkAllows(
			center.organizationId,
			"trustCenter",
			clientIp(req),
		))
	)
		return ingestJson(403, { error: "network_denied" });
	// Zugestimmt wurde der angezeigten Fassung — hat sich der NDA-Text
	// inzwischen geändert, muss die Seite neu geladen werden.
	if (d.ndaVersion !== center.snapshot.ndaVersion)
		return ingestJson(409, { error: "nda_changed" });
	await createTrustRequest({
		center,
		name: d.name,
		email: d.email,
		company: d.company,
		reason: d.reason,
		ndaVersion: d.ndaVersion,
		ip,
		userAgent: req.headers.get("user-agent"),
	});
	return accepted();
});
