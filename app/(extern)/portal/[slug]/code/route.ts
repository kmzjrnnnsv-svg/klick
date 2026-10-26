import { env } from "@/lib/env";
import { json, portalRoute, sameOriginJson } from "@/lib/policy-portal/http";
import { publicPortal, requestPortalCode } from "@/lib/policy-portal/service";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/ingest";

export const dynamic = "force-dynamic";

// Einmal-Code anfordern. Antwort immer 202 — ob die Adresse zur Org gehört,
// lässt sich daran nicht ablesen. Begrenzt je IP (sichtbar, 429) und je
// Adresse (still).
const perIp = new SlidingWindowLimiter(10, 10 * 60_000);
const perAddress = new SlidingWindowLimiter(3, 10 * 60_000);

export const POST = portalRoute("policy_portal.code", async (req, { slug }) => {
	if (!sameOriginJson(req)) return json(403, { error: "forbidden" });
	if (!perIp.check(clientIp(req)).allowed)
		return json(429, { error: "rate_limited" });
	const body = (await req.json().catch(() => null)) as {
		email?: unknown;
	} | null;
	const email =
		typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	if (!/^[^\s@]{1,64}@[^\s@]{3,253}$/.test(email))
		return json(400, { error: "invalid" });
	const portal = await publicPortal(slug);
	if (!portal) return json(404, { error: "not_found" });
	if (perAddress.check(`${slug}:${email}`).allowed)
		await requestPortalCode({
			portal,
			email,
			baseUrl: new URL(env().BETTER_AUTH_URL).origin,
			userAgent: req.headers.get("user-agent"),
		});
	return json(202, { ok: true });
});
