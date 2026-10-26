import { db } from "@wallet/db";
import { passkey } from "@wallet/db/auth-schema";
import { auditPlatform } from "@wallet/lib/audit";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { count, eq } from "drizzle-orm";
import {
	authEndpointDecision,
	GUARDED_AUTH_PATHS,
} from "@/lib/auth/endpoint-policy";
import { ipFromHeaders, isStepUpFresh } from "@/lib/auth/session-rules";
import { LINK_CONTEXT, LINK_COOKIE } from "./links";

// Faktor-Endpunkte von Better Auth über dieselbe Regel wie Klick
// (lib/auth/endpoint-policy.ts): Passkey verwalten nur mit frischem Step-up,
// Erstregistrierung ohne Sitzung nur mit Link-Cookie, nie den letzten löschen.

export async function passkeyCount(userId: string): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return Number(row?.n ?? 0);
}

const asDate = (v: unknown): Date | null =>
	v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;

export const authBeforeHook = createAuthMiddleware(async (ctx) => {
	if (!GUARDED_AUTH_PATHS.has(ctx.path)) return;
	const current = await getSessionFromCtx(ctx).catch(() => null);
	const s = current?.session as
		| { mfaVerifiedAt?: unknown; stepUpAt?: unknown }
		| undefined;
	const mfaVerifiedAt = asDate(s?.mfaVerifiedAt);
	const decision = authEndpointDecision(ctx.path, {
		hasSession: Boolean(current),
		mfaVerified: Boolean(mfaVerifiedAt),
		stepUpFresh: current
			? isStepUpFresh({ stepUpAt: asDate(s?.stepUpAt), mfaVerifiedAt })
			: false,
		hasTotp: false,
		passkeys: current ? await passkeyCount(current.user.id) : 0,
		hasRegistrationToken:
			ctx.query?.context === LINK_CONTEXT &&
			Boolean(ctx.getCookie(LINK_COOKIE)),
		// both.money hat kein Admin-Plugin (keine /admin/*-Endpunkte); die
		// Plattform-Verwaltung läuft am Terminal (pnpm wallet:admin)
		adminNetwork: true,
		impersonated: false,
		httpRequest: Boolean(ctx.request),
	});
	if (decision.allow) return;
	await auditPlatform(
		{
			userId: current?.user.id ?? null,
			ip: ipFromHeaders(ctx.headers),
			userAgent: ctx.headers?.get("user-agent") ?? null,
		},
		{
			action: "auth.blocked_endpoint",
			outcome: "failure",
			after: { path: ctx.path, reason: decision.code },
		},
	).catch(() => undefined);
	throw new APIError("FORBIDDEN", {
		code: decision.code.toUpperCase(),
		message: decision.code,
	});
});
