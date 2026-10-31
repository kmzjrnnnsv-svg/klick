import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { orgSuspended } from "@/lib/org/suspension";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/ingest";
import { type ResolvedSite, resolveSiteLink } from "@/lib/site-tunnels/service";
import { cookieValue } from "@/lib/trust/access";

// Link für die IT (Standort-Tunnel, ADR-033/ADR-017): Token aus dem Cookie
// auflösen, IP-Liste der Org (wie für Externe) und Sperre prüfen, Grenzen je
// IP. Gilt die Liste nur für den Standort, kommt die IT über den Tunnel herein.

export const SITE_COOKIE = "kst";
export const SITE_COOKIE_PATH = "/api/standort";
export const perIp = new SlidingWindowLimiter(30, 60_000);

export function sameOriginJson(req: Request): boolean {
	const origin = req.headers.get("origin");
	return Boolean(
		req.headers.get("content-type")?.startsWith("application/json") &&
			(!origin || origin === new URL(env().BETTER_AUTH_URL).origin),
	);
}

export function ipHash(ip: string): string {
	return createHmac("sha256", env().BETTER_AUTH_SECRET)
		.update(`site-setup:${ip}`)
		.digest("hex")
		.slice(0, 32);
}

export async function siteFrom(
	req: Request,
	raw: string | null,
): Promise<
	| { ok: true; site: ResolvedSite }
	| { ok: false; status: number; error: string }
> {
	if (!raw) return { ok: false, status: 401, error: "none" };
	const r = await resolveSiteLink(raw);
	if (!r.ok) return { ok: false, status: 401, error: r.error };
	if (
		!(await orgNetworkAllows(r.site.orgId, "app", clientIp(req), {
			external: true,
		}))
	)
		return { ok: false, status: 403, error: "network_denied" };
	if (await orgSuspended(r.site.orgId))
		return { ok: false, status: 404, error: "not_found" };
	return r;
}

export const cookieToken = (req: Request) => cookieValue(req, SITE_COOKIE);
