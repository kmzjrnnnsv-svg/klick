import { NextResponse } from "next/server";
import { mutateOrg } from "@/lib/db/with-org";
import {
	clientIp,
	ingestJson,
	ingestRoute,
	touchToken,
} from "@/lib/security/ingest";
import {
	ipHash,
	perIp,
	SITE_COOKIE,
	SITE_COOKIE_PATH,
	sameOriginJson,
	siteFrom,
} from "../_shared";

export const dynamic = "force-dynamic";

// Link für die IT (Standort-Tunnel, ADR-033, ADR-017): der Token steht im
// Fragment (#klk_site_…); die Seite schickt ihn einmal hierher und bekommt
// ein httpOnly-Cookie nur für /api/standort (SameSite=Strict).
export const POST = ingestRoute("site_setup.session", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	if (!sameOriginJson(req)) return ingestJson(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const r = await siteFrom(req, raw);
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const { site } = r;
	await mutateOrg(
		{
			orgId: site.orgId,
			userId: null,
			ip: null,
			userAgent: req.headers.get("user-agent"),
		},
		async (tx) => {
			await touchToken(tx, site.tokenId, ipHash(ip));
			return {
				result: null,
				audit: {
					action: "site_tunnel.link_opened",
					target: `site_tunnel:${site.tunnelId}`,
					after: { via: "site_link", tokenId: site.tokenId },
				},
			};
		},
	);
	const res = new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});
	res.cookies.set(SITE_COOKIE, raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: SITE_COOKIE_PATH,
		expires: new Date(site.view.expiresAt),
	});
	return res;
});

export const DELETE = ingestRoute("site_setup.logout", async () => {
	const res = new NextResponse(null, { status: 204 });
	res.cookies.set(SITE_COOKIE, "", { path: SITE_COOKIE_PATH, maxAge: 0 });
	return res;
});
