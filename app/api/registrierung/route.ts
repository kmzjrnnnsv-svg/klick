import { NextResponse } from "next/server";
import { roleLabel } from "@/lib/auth/memberships";
import {
	REG_COOKIE,
	REG_COOKIE_PATH,
	resolveRegistration,
	setRegistrationName,
} from "@/lib/auth/registration-link";
import { env } from "@/lib/env";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";

export const dynamic = "force-dynamic";

// Passkey-Links (Einladung, Zugang zurücksetzen; ADR-019): Die Seite liest
// den Token aus dem URL-Fragment — Fragmente erreichen nie den Server, also
// auch keine Zugriffs-Logs — und tauscht ihn hier gegen ein httpOnly-Cookie,
// das nur die Passkey-Endpunkte sehen (Pfad /api/auth/passkey). Antwort:
// was die Seite anzeigen darf (Organisation, Rolle, Adresse).

const perIp = new SlidingWindowLimiter(20, 60_000);
const COOKIE_MS = 30 * 60 * 1000;

export const POST = ingestRoute("registration.link", async (req: Request) => {
	if (!perIp.check(clientIp(req)).allowed)
		return ingestJson(429, { error: "rate_limited" });
	const origin = req.headers.get("origin");
	if (
		!req.headers.get("content-type")?.startsWith("application/json") ||
		(origin && origin !== new URL(env().BETTER_AUTH_URL).origin)
	)
		return ingestJson(403, { error: "forbidden" });
	const body = (await req.json().catch(() => null)) as {
		token?: unknown;
		name?: unknown;
	} | null;
	const raw = typeof body?.token === "string" ? body.token.trim() : "";
	const r = await resolveRegistration(raw);
	if (!r.ok) return ingestJson(401, { error: r.error });
	const name =
		typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
	if (name) await setRegistrationName(raw, name);

	const info = r.info;
	const res = NextResponse.json(
		info.kind === "invite"
			? {
					kind: info.kind,
					invitationId: info.invitationId,
					email: info.email,
					organization: info.organization,
					role: roleLabel(info.role),
					inviter: info.inviter,
					accountExists: info.accountExists,
					expiresAt: info.expiresAt,
				}
			: {
					kind: info.kind,
					email: info.email,
					name: info.name,
					expiresAt: info.expiresAt,
				},
		{ headers: { "cache-control": "no-store" } },
	);
	res.cookies.set(REG_COOKIE, raw, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: REG_COOKIE_PATH,
		expires: new Date(
			Math.min(info.expiresAt.getTime(), Date.now() + COOKIE_MS),
		),
	});
	return res;
});

export const DELETE = ingestRoute("registration.clear", async () => {
	const res = new NextResponse(null, { status: 204 });
	res.cookies.set(REG_COOKIE, "", { path: REG_COOKIE_PATH, maxAge: 0 });
	return res;
});
