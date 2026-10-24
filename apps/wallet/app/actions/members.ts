"use server";

import { requireOrg, requireStepUp } from "@wallet/lib/auth/guards";
import { ROLE_LABEL } from "@wallet/lib/auth/permissions";
import { invitationMail, sendWalletMail } from "@wallet/lib/mail/templates";
import { createInvitation } from "@wallet/lib/orgs/invitations";
import {
	changeMemberRole as change,
	markNotificationsRead as markRead,
	removeMember as remove,
	revokeInvitation as revoke,
} from "@wallet/lib/orgs/members";
import { inviteSchema, roleChangeSchema } from "@wallet/lib/validation/members";
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import type { ActionResult } from "./auth";

const orgCtx = (c: Awaited<ReturnType<typeof requireOrg>>) => ({
	orgId: c.orgId,
	userId: c.userId,
	ip: c.ip,
	userAgent: c.userAgent,
});

// Einladen: Link zum Kopieren, Mail optional (Passkey zuerst, ADR-019)
async function inviteMemberImpl(
	input: unknown,
): Promise<ActionResult<{ url: string; mailed: boolean }>> {
	const c = await requireStepUp("members:manage");
	const parsed = inviteSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const inv = await createInvitation(orgCtx(c), parsed.data);
	let mailed = false;
	if (parsed.data.sendMail) {
		const res = await sendWalletMail(
			parsed.data.email,
			invitationMail({
				url: inv.url,
				organization: c.orgName,
				role: ROLE_LABEL[parsed.data.role],
				inviter: c.name,
			}),
		);
		mailed = res.ok;
	}
	revalidatePath("/members");
	return { ok: true, data: { url: inv.url, mailed } };
}

async function changeMemberRoleImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp("members:manage");
	const parsed = roleChangeSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await change(orgCtx(c), parsed.data.memberId, parsed.data.role);
	if (!res.ok) return res;
	revalidatePath("/members");
	return { ok: true, data: undefined };
}

async function removeMemberImpl(memberId: string): Promise<ActionResult> {
	const c = await requireStepUp("members:manage");
	if (typeof memberId !== "string") return { ok: false, error: "invalid" };
	const res = await remove(orgCtx(c), memberId);
	if (!res.ok) return res;
	revalidatePath("/members");
	return { ok: true, data: undefined };
}

async function revokeInvitationImpl(id: string): Promise<ActionResult> {
	const c = await requireStepUp("members:manage");
	if (typeof id !== "string") return { ok: false, error: "invalid" };
	if (!(await revoke(orgCtx(c), id))) return { ok: false, error: "not_found" };
	revalidatePath("/members");
	return { ok: true, data: undefined };
}

async function markNotificationsReadImpl(): Promise<ActionResult> {
	const c = await requireOrg();
	await markRead(orgCtx(c));
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

export const inviteMember = safeAction("inviteMember", inviteMemberImpl);
export const changeMemberRole = safeAction(
	"changeMemberRole",
	changeMemberRoleImpl,
);
export const removeMember = safeAction("removeMember", removeMemberImpl);
export const revokeInvitation = safeAction(
	"revokeInvitation",
	revokeInvitationImpl,
);
export const markNotificationsRead = safeAction(
	"markNotificationsRead",
	markNotificationsReadImpl,
);
