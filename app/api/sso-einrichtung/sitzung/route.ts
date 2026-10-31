import { NextResponse } from "next/server";
import { SETUP_COOKIE, SETUP_COOKIE_PATH } from "@/lib/auth/sso-setup-link";
import { mutateOrg } from "@/lib/db/with-org";
import {
	clientIp,
	ingestJson,
	ingestRoute,
	touchToken,
} from "@/lib/security/ingest";
import { ipHash, perIp, sameOriginJson, setupFrom } from "../_shared";

export const dynamic = "force-dynamic";

// Einrichtungslink der IT (AP10d, ADR-017): Der Link trägt den Token im
// Fragment (#klk_sso_…); die Seite schickt ihn einmal hierher und bekommt ein
// httpOnly-Cookie nur für /api/sso-einrichtung (SameSite=Strict).
export const POST = ingestRoute("sso_setup.session", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	if (!sameOriginJson(req)) return ingestJson(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const r = await setupFrom(req, raw);
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const { setup } = r;
	await mutateOrg(
		{
			orgId: setup.orgId,
			userId: null,
			ip: null,
			userAgent: req.headers.get("user-agent"),
		},
		async (tx) => {
			await touchToken(tx, setup.tokenId, ipHash(ip));
			return {
				result: null,
				audit: {
					action: "sso.setup_link_opened",
					target: `sso_setup_request:${setup.requestId}`,
					after: { via: "sso_setup_link", tokenId: setup.tokenId },
				},
			};
		},
	);
	const res = new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});
	res.cookies.set(SETUP_COOKIE, raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: SETUP_COOKIE_PATH,
		expires: new Date(setup.view.expiresAt),
	});
	return res;
});

export const DELETE = ingestRoute("sso_setup.logout", async () => {
	const res = new NextResponse(null, { status: 204 });
	res.cookies.set(SETUP_COOKIE, "", { path: SETUP_COOKIE_PATH, maxAge: 0 });
	return res;
});
