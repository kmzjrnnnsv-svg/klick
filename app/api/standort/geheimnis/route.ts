import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";
import { revealSiteSecret } from "@/lib/site-tunnels/service";
import { cookieToken, sameOriginJson, siteFrom } from "../_shared";

export const dynamic = "force-dynamic";

// Schlüssel für die IT (Standort-Tunnel, ADR-033): Pre-shared Key bzw.
// WireGuard-Datei. Nur auf Knopfdruck (POST, gleiche Herkunft), höchstens
// 10 Abrufe je 10 min und IP, jeder Abruf in der Kette der Org.
const perIp = new SlidingWindowLimiter(10, 10 * 60_000);

export const POST = ingestRoute("site_setup.secret", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	if (!sameOriginJson(req)) return ingestJson(403, { error: "forbidden" });
	const r = await siteFrom(req, cookieToken(req));
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const secret = await revealSiteSecret(r.site, {
		ip: null,
		userAgent: req.headers.get("user-agent"),
	});
	if (!secret) return ingestJson(404, { error: "not_found" });
	return ingestJson(200, secret);
});
