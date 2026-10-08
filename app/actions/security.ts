"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, checkSessionRules, getSessionCtx } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { verifyStepUpCode } from "@/lib/auth/step-up";
import type { ActionResult } from "@/lib/validation/common";

async function verifyStepUpImpl(code: string): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	const res = await verifyStepUpCode({
		userId: ctx.user.id,
		sessionId: ctx.session.id,
		code,
		ip: ctx.ip,
		userAgent: ctx.userAgent,
	});
	if (!res.ok) return { ok: false, error: res.error };
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

async function revokeSessionImpl(token: string): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	try {
		await auth.api.revokeSession({ body: { token }, headers: await headers() });
		revalidatePath("/einstellungen");
		return { ok: true, data: undefined };
	} catch (e) {
		if (e instanceof APIError) return { ok: false, error: e.message };
		throw e;
	}
}

async function revokeOtherSessionsImpl(): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	try {
		await auth.api.revokeOtherSessions({ headers: await headers() });
		revalidatePath("/einstellungen");
		return { ok: true, data: undefined };
	} catch (e) {
		if (e instanceof APIError) return { ok: false, error: e.message };
		throw e;
	}
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const verifyStepUp = safeAction("verifyStepUp", verifyStepUpImpl);
export const revokeSession = safeAction("revokeSession", revokeSessionImpl);
export const revokeOtherSessions = safeAction(
	"revokeOtherSessions",
	revokeOtherSessionsImpl,
);
