import { json, portalRoute, sameOriginJson } from "@/lib/policy-portal/http";
import { portalCookieName, portalPath } from "@/lib/policy-portal/rules";
import { publicPortal, redeemPortalCode } from "@/lib/policy-portal/service";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/ingest";

export const dynamic = "force-dynamic";

// Code einlösen → httpOnly-Cookie kr_<slug> nur unter /portal/<slug>
// (SameSite=Lax, damit der Link aus der Mail angemeldet öffnet). Der Token
// steht nie in einer URL.
const perIp = new SlidingWindowLimiter(20, 10 * 60_000);

export const POST = portalRoute(
	"policy_portal.sign_in",
	async (req, { slug }) => {
		if (!sameOriginJson(req)) return json(403, { error: "forbidden" });
		const ip = clientIp(req);
		if (!perIp.check(ip).allowed) return json(429, { error: "rate_limited" });
		const body = (await req.json().catch(() => null)) as {
			email?: unknown;
			code?: unknown;
		} | null;
		const email = typeof body?.email === "string" ? body.email : "";
		const code =
			typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
		const portal = await publicPortal(slug);
		if (!portal) return json(404, { error: "not_found" });
		const res = await redeemPortalCode({
			portal,
			email,
			code,
			ip,
			userAgent: req.headers.get("user-agent"),
		});
		if (!res.ok) return json(401, { error: res.error });
		const out = json(200, { ok: true });
		out.cookies.set(portalCookieName(slug), res.token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: portalPath(slug),
			expires: res.expiresAt,
		});
		return out;
	},
);
