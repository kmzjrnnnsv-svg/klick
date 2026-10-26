import { baseURL } from "@wallet/lib/auth/config";
import {
	LINK_COOKIE,
	LINK_COOKIE_PATH,
	resolveLink,
	setLinkName,
} from "@wallet/lib/auth/links";
import { linkNeedsSecurityKey } from "@wallet/lib/auth/passkey-link";
import { ROLE_LABEL } from "@wallet/lib/auth/permissions";
import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { SlidingWindowLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Link-Tausch (Aktivieren, Zugang zurücksetzen, Einladung): Die Seite liest
// den Token aus dem URL-Fragment — Fragmente erreichen nie den Server — und
// tauscht ihn hier gegen ein httpOnly-Cookie, das nur die Passkey-Endpunkte
// sehen. Antwort: was die Seite anzeigen darf.

const perIp = new SlidingWindowLimiter(20, 60_000);
const COOKIE_MS = 30 * 60 * 1000;
const json = (status: number, body: unknown) =>
	NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
	if (!perIp.check(ipFromHeaders(req.headers) ?? "unknown").allowed)
		return json(429, { error: "rate_limited" });
	const origin = req.headers.get("origin");
	if (
		!req.headers.get("content-type")?.startsWith("application/json") ||
		(origin && origin !== new URL(baseURL).origin)
	)
		return json(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
		name?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const r = await resolveLink(raw);
	if (!r.ok) return json(401, { error: "invalid" });
	const name =
		typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
	if (name) await setLinkName(raw, name);
	const info = r.info;
	// Org verlangt Sicherheitsschlüssel: die Seite bittet darum und fordert
	// beim Anlegen einen externen Authenticator an (Härtung W)
	const securityKey = await linkNeedsSecurityKey(r);
	const res = json(
		200,
		info.kind === "invite"
			? {
					kind: info.kind,
					invitationId: info.invitationId,
					organizationId: info.organizationId,
					organization: info.organization,
					email: info.email,
					role: ROLE_LABEL[info.role],
					accountExists: info.accountExists,
					expiresAt: info.expiresAt,
					securityKey,
				}
			: {
					kind: info.kind,
					email: info.email,
					name: info.name,
					expiresAt: info.expiresAt,
					securityKey,
				},
	);
	res.cookies.set(LINK_COOKIE, raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: LINK_COOKIE_PATH,
		expires: new Date(
			Math.min(info.expiresAt.getTime(), Date.now() + COOKIE_MS),
		),
	});
	return res;
}

export async function DELETE() {
	const res = new NextResponse(null, { status: 204 });
	res.cookies.set(LINK_COOKIE, "", { path: LINK_COOKIE_PATH, maxAge: 0 });
	return res;
}
