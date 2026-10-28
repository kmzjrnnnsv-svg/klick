import { NextResponse } from "next/server";
import { PORTAL_COOKIE } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { resolveToken } from "@/lib/db/with-token";
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

export const dynamic = "force-dynamic";

// Lieferantenportal (ADR-017): Der Einladungslink trägt den Token im
// URL-Fragment (#klk_portal_…) — Fragmente gehen nie an den Server, landen
// also nicht in Zugriffs-Logs oder Referrern. Die Portalseite schickt ihn
// einmal hierher und bekommt ein httpOnly-Cookie (SameSite=Strict, nur
// /lieferant), das bis zum Ablauf des Tokens gilt.

const perIp = new SlidingWindowLimiter(20, 60_000);

export const POST = ingestRoute("portal.session", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	// Nur aus der Portalseite: JSON (erzwingt CORS-Preflight) und gleiche
	// Herkunft — keine fremde Seite setzt dem Browser ein Portal-Cookie.
	const origin = req.headers.get("origin");
	if (
		!req.headers.get("content-type")?.startsWith("application/json") ||
		(origin && origin !== new URL(env().BETTER_AUTH_URL).origin)
	)
		return ingestJson(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const r = await resolveToken(raw, "supplier_portal");
	if (!r.ok) return ingestJson(401, { error: r.error });
	const t = r.token;
	if (t.subjectType !== "assessment" || !t.subjectId)
		return ingestJson(401, { error: "invalid" });
	// IP-Liste der Organisation (Härtung A5), außer das Portal ist ausgenommen
	if (!(await orgNetworkAllows(t.organizationId, "supplierPortal", ip)))
		return ingestJson(403, { error: "network_denied" });
	if (await orgSuspended(t.organizationId))
		return ingestJson(403, { error: "org_suspended" });
	await mutateOrg(
		{
			orgId: t.organizationId,
			userId: null,
			ip,
			userAgent: req.headers.get("user-agent"),
		},
		async (tx) => {
			await touchToken(tx, t.id, ip);
			return {
				result: null,
				audit: {
					action: "supplier_portal.opened",
					target: `assessment:${t.subjectId}`,
					after: { via: "supplier_portal", tokenId: t.id },
				},
			};
		},
	);
	const res = new NextResponse(null, {
		status: 204,
		headers: { "cache-control": "no-store" },
	});
	res.cookies.set(PORTAL_COOKIE, raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/lieferant",
		expires: t.expiresAt,
	});
	return res;
});

export const DELETE = ingestRoute("portal.logout", async () => {
	const res = new NextResponse(null, { status: 204 });
	res.cookies.set(PORTAL_COOKIE, "", { path: "/lieferant", maxAge: 0 });
	return res;
});
