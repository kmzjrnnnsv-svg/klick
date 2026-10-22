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
	requireOrg,
	requireStepUp,
} from "@/lib/auth/guards";
import { lockWalletSession } from "@/lib/auth/org";
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
	if (purpose !== "mfa" && purpose !== "stepup" && purpose !== "wallet")
		return null;
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	// Wallet entsperren: volle Sitzungsregeln, Mitgliedschaft mit
	// wallet:read in der aktiven Org, nie in einer Impersonation-Sitzung.
	if (purpose === "wallet") {
		const org = await requireOrg({ wallet: ["read"] });
		if ((ctx.session as { impersonatedBy?: string | null }).impersonatedBy)
			throw new AuthError("forbidden");
		return {
			ctx,
			purpose: "wallet" as ConfirmPurpose,
			// Echtgeld gibt es erst ab Phase 3 (signierte Richtlinie); bis
			// dahin nur Testnetze — dann ist das Alter des Passkeys egal.
			wallet: { orgId: org.orgId, liveEnabled: false },
		};
	}
	try {
		checkSessionRules(ctx);
	} catch (e) {
		const pending =
			purpose === "mfa" && e instanceof AuthError && e.code === "mfa_required";
		if (!pending) throw e;
	}
	return {
		ctx,
		purpose: purpose as ConfirmPurpose,
		wallet: undefined as { orgId: string; liveEnabled: boolean } | undefined,
	};
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
		wallet: c.wallet,
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

// Wallet-Bereich sofort schließen (Knopf „Jetzt sperren“)
async function lockWalletImpl(): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	await lockWalletSession(ctx.session.id);
	revalidatePath("/wallet", "layout");
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
export const lockWallet = safeAction("lockWallet", lockWalletImpl);
