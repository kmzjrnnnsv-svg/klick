import { NextResponse } from "next/server";
import { publicTrustCenter } from "@/lib/db/trust";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { orgSuspended } from "@/lib/org/suspension";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import {
	clientIp,
	ingestJson,
	ingestRoute,
	touchToken,
} from "@/lib/security/ingest";
import {
	cookieValue,
	resolveTrustAccess,
	TRUST_COOKIE_PATH,
	trustCookieName,
	trustIpHash,
} from "@/lib/trust/access";
import { slugValid } from "@/lib/trust/rules";

export const dynamic = "force-dynamic";

// Trust Center (ADR-017): Der Freigabe-Link trägt den Token im Fragment
// (#klk_trust_…) — er erreicht nie einen Server-Log. Die Seite
// /vertrauen/<slug>/unterlagen schickt ihn einmal hierher und bekommt ein
// httpOnly-Cookie (SameSite=Strict, nur /api/vertrauen), das bis zum Ablauf
// des Zugangs gilt. GET meldet den Stand für die Seite.

const perIp = new SlidingWindowLimiter(20, 60_000);

const sameOriginJson = (req: Request) => {
	const origin = req.headers.get("origin");
	return (
		req.headers.get("content-type")?.startsWith("application/json") &&
		(!origin || origin === new URL(env().BETTER_AUTH_URL).origin)
	);
};

export const POST = ingestRoute("trust.session", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	if (!sameOriginJson(req)) return ingestJson(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
		slug?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const slug = typeof body?.slug === "string" ? body.slug : "";
	const center = await publicTrustCenter(slug);
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
	if (await orgSuspended(center.organizationId))
		return ingestJson(404, { error: "not_found" });
	const r = await resolveTrustAccess(raw, center);
	if (!r.ok) return ingestJson(401, { error: r.error });
	const { token, request } = r.access;
	await mutateOrg(
		{
			orgId: token.organizationId,
			userId: null,
			ip: null,
			userAgent: req.headers.get("user-agent"),
		},
		async (tx) => {
			await touchToken(tx, token.id, trustIpHash(ip));
			return {
				result: null,
				audit: {
					action: "trust.access_opened",
					target: `trust_request:${request.id}`,
					after: { via: "trust_center", tokenId: token.id },
				},
			};
		},
	);
	const res = new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});
	res.cookies.set(trustCookieName(center.slug), raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: TRUST_COOKIE_PATH,
		expires: token.expiresAt,
	});
	return res;
});

export const GET = ingestRoute("trust.session_state", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	const slug = new URL(req.url).searchParams.get("slug") ?? "";
	if (!slugValid(slug)) return ingestJson(404, { error: "not_found" });
	const raw = cookieValue(req, trustCookieName(slug));
	if (!raw) return ingestJson(200, { active: false, reason: "none" });
	const center = await publicTrustCenter(slug);
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
	if (await orgSuspended(center.organizationId))
		return ingestJson(404, { error: "not_found" });
	const r = await resolveTrustAccess(raw, center);
	if (!r.ok) return ingestJson(200, { active: false, reason: r.error });
	return ingestJson(200, {
		active: true,
		name: r.access.request.name,
		company: r.access.request.company,
		expiresAt: r.access.request.expiresAt,
	});
});

export const DELETE = ingestRoute("trust.logout", async (req: Request) => {
	const slug = new URL(req.url).searchParams.get("slug") ?? "";
	const res = new NextResponse(null, { status: 204 });
	if (slugValid(slug))
		res.cookies.set(trustCookieName(slug), "", {
			path: TRUST_COOKIE_PATH,
			maxAge: 0,
		});
	return res;
});
