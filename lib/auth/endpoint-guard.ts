import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { count, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { authEndpointDecision, GUARDED_AUTH_PATHS } from "./endpoint-policy";
import { REG_CONTEXT, REG_COOKIE } from "./registration-link";
import { ipFromHeaders, isStepUpFresh } from "./session-rules";

export async function passkeyCount(userId: string): Promise<number> {
	const [row] = await globalDb
		.select({ n: count() })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return Number(row?.n ?? 0);
}

export async function userHasPasskey(userId: string): Promise<boolean> {
	return (await passkeyCount(userId)) > 0;
}

const asDate = (v: unknown): Date | null =>
	v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;

// hooks.before: Faktor-Endpunkte nur nach lib/auth/endpoint-policy.ts.
// Andere Pfade laufen ohne zusätzliche Abfrage durch.
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
		hasTotp: Boolean(current?.user.twoFactorEnabled),
		passkeys: current ? await passkeyCount(current.user.id) : 0,
		// Link-Registrierung: Merker im Query, Token im httpOnly-Cookie
		// (geprüft in registration.resolveUser, lib/auth/passkey-link.ts)
		hasRegistrationToken:
			ctx.query?.context === REG_CONTEXT && Boolean(ctx.getCookie(REG_COOKIE)),
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
