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
import { ipFromHeaders, isStepUpFresh } from "./session-rules";

export async function userHasPasskey(userId: string): Promise<boolean> {
	const [row] = await globalDb
		.select({ n: count() })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return Number(row?.n ?? 0) > 0;
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
	const context = ctx.query?.context;
	const decision = authEndpointDecision(ctx.path, {
		hasSession: Boolean(current),
		mfaVerified: Boolean(mfaVerifiedAt),
		stepUpFresh: current
			? isStepUpFresh({ stepUpAt: asDate(s?.stepUpAt), mfaVerifiedAt })
			: false,
		hasTotp: Boolean(current?.user.twoFactorEnabled),
		hasPasskey: current ? await userHasPasskey(current.user.id) : false,
		hasRegistrationToken: typeof context === "string" && context.length > 0,
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
