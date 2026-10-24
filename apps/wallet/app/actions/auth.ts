"use server";

import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { auditPlatform } from "@wallet/lib/audit";
import {
	getSessionCtx,
	requireOrg,
	requireSession,
} from "@wallet/lib/auth/guards";
import {
	type ConfirmPurpose,
	lockSession,
	passkeyConfirmOptions,
	verifyPasskeyConfirm,
} from "@wallet/lib/auth/passkey-confirm";
import { switchSessionOrg } from "@wallet/lib/auth/session-state";
import { acceptInvitation as accept } from "@wallet/lib/orgs/invitations";
import { listMemberships } from "@wallet/lib/orgs/memberships";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { AuthError } from "@/lib/auth/session-rules";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string; ref?: string };

const isPurpose = (p: unknown): p is ConfirmPurpose =>
	p === "stepup" || p === "unlock";

async function passkeyOptionsImpl(
	purpose: ConfirmPurpose,
): Promise<ActionResult<PublicKeyCredentialRequestOptionsJSON>> {
	if (!isPurpose(purpose)) return { ok: false, error: "invalid" };
	const ctx =
		purpose === "unlock" ? await requireOrg() : await requireSession();
	const s =
		"orgId" in ctx
			? { userId: ctx.userId, sessionId: ctx.sessionId }
			: { userId: ctx.user.id, sessionId: ctx.session.id };
	const options = await passkeyConfirmOptions({ ...s, purpose });
	if (!options) return { ok: false, error: "no_passkey" };
	return { ok: true, data: options };
}

async function confirmPasskeyImpl(
	purpose: ConfirmPurpose,
	response: AuthenticationResponseJSON,
): Promise<ActionResult> {
	if (!isPurpose(purpose) || typeof response?.id !== "string")
		return { ok: false, error: "invalid" };
	const ctx = await requireSession();
	const org = purpose === "unlock" ? await requireOrg() : null;
	const res = await verifyPasskeyConfirm({
		userId: ctx.user.id,
		sessionId: ctx.session.id,
		purpose,
		orgId: org?.orgId ?? null,
		response,
		ip: ctx.ip,
		userAgent: ctx.userAgent,
	});
	if (!res.ok) return res;
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

async function lockImpl(): Promise<ActionResult> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	await lockSession(ctx.session.id);
	await auditPlatform(
		{ userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent },
		{ action: "auth.locked", target: `session:${ctx.session.id}` },
	);
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

// Org wechseln: Entsperrung und Step-up gelten nur in der Org, in der sie
// bestätigt wurden
async function switchOrgImpl(orgId: string): Promise<ActionResult> {
	const ctx = await requireSession();
	const m = (await listMemberships(ctx.user.id)).find((x) => x.orgId === orgId);
	if (!m) return { ok: false, error: "forbidden" };
	await switchSessionOrg(ctx.session.id, orgId);
	await auditPlatform(
		{ userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent },
		{ action: "auth.org_switched", target: `org:${orgId}` },
	);
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

async function acceptInvitationImpl(input: {
	organizationId: string;
	invitationId: string;
}): Promise<ActionResult<{ orgId: string }>> {
	const ctx = await requireSession();
	if (
		typeof input?.organizationId !== "string" ||
		typeof input?.invitationId !== "string"
	)
		return { ok: false, error: "invalid" };
	const res = await accept(
		{
			userId: ctx.user.id,
			email: ctx.user.email,
			sessionId: ctx.session.id,
			verifiedAt: ctx.session.mfaVerifiedAt ?? null,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		},
		input,
	);
	if (!res.ok) return res;
	revalidatePath("/", "layout");
	return { ok: true, data: { orgId: res.orgId } };
}

export const passkeyOptions = safeAction("passkeyOptions", passkeyOptionsImpl);
export const confirmPasskey = safeAction("confirmPasskey", confirmPasskeyImpl);
export const lock = safeAction("lock", lockImpl);
export const switchOrg = safeAction("switchOrg", switchOrgImpl);
export const acceptInvitation = safeAction(
	"acceptInvitation",
	acceptInvitationImpl,
);
