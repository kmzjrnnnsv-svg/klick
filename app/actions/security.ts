"use server";

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { safeAction } from "@/lib/actions/safe";
import {
	AuthError,
	checkSessionRules,
	getSessionCtx,
	requireStepUp,
} from "@/lib/auth/guards";
import {
	type ConfirmPurpose,
	passkeyConfirmOptions,
	verifyPasskeyConfirm,
} from "@/lib/auth/passkey-confirm";
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

// Bestätigen mit Passkey (lib/auth/passkey-confirm.ts): „mfa“ nach einer
// Mail-Link-Anmeldung — dann fehlt der zweite Faktor noch, alle anderen
// Sitzungsregeln gelten —, „stepup“ vor sensiblen Aktionen.
async function confirmCtx(purpose: unknown) {
	if (purpose !== "mfa" && purpose !== "stepup") return null;
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	try {
		checkSessionRules(ctx);
	} catch (e) {
		const pending =
			purpose === "mfa" && e instanceof AuthError && e.code === "mfa_required";
		if (!pending) throw e;
	}
	return { ctx, purpose: purpose as ConfirmPurpose };
}

async function passkeyOptionsImpl(
	purpose: ConfirmPurpose,
): Promise<ActionResult<PublicKeyCredentialRequestOptionsJSON>> {
	const c = await confirmCtx(purpose);
	if (!c) return { ok: false, error: "invalid" };
	const options = await passkeyConfirmOptions({
		userId: c.ctx.user.id,
		sessionId: c.ctx.session.id,
		purpose: c.purpose,
	});
	if (!options) return { ok: false, error: "no_passkey" };
	return { ok: true, data: options };
}

async function confirmPasskeyImpl(
	purpose: ConfirmPurpose,
	response: AuthenticationResponseJSON,
): Promise<ActionResult> {
	const c = await confirmCtx(purpose);
	if (!c || typeof response?.id !== "string")
		return { ok: false, error: "invalid" };
	const res = await verifyPasskeyConfirm({
		userId: c.ctx.user.id,
		sessionId: c.ctx.session.id,
		purpose: c.purpose,
		response,
		ip: c.ctx.ip,
		userAgent: c.ctx.userAgent,
	});
	if (!res.ok) return res;
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

// Vor einem Export-Download: frischer Step-up? Sonst meldet die Action
// step_up_required, ExportLink öffnet den Dialog und lädt danach herunter —
// ohne Umweg über /login/2fa (dort endete der Rückweg auf die API-Route
// als Seitennavigation im Leeren).
async function ensureExportStepUpImpl(): Promise<ActionResult> {
	await requireStepUp({ export: ["create"] });
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
export const passkeyOptions = safeAction("passkeyOptions", passkeyOptionsImpl);
export const confirmPasskey = safeAction("confirmPasskey", confirmPasskeyImpl);
export const ensureExportStepUp = safeAction(
	"ensureExportStepUp",
	ensureExportStepUpImpl,
);
export const revokeSession = safeAction("revokeSession", revokeSessionImpl);
export const revokeOtherSessions = safeAction(
	"revokeOtherSessions",
	revokeOtherSessionsImpl,
);
