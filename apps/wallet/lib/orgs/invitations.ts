import { invitations, members } from "@wallet/db/schema";
import type { MemberRole } from "@wallet/db/schema/enums";
import { issueLink, openInvitation } from "@wallet/lib/auth/links";
import { joinSessionOrg } from "@wallet/lib/auth/session-state";
import { mutateOrg, type OrgCtx } from "@wallet/lib/db/with-org";
import { and, eq } from "drizzle-orm";

// Einladungen in eine Org: Link kwl_invite_… (72 h), angenommen nur von der
// eingeladenen Adresse — als neues Konto (Passkey über den Link) oder mit
// bestehendem Konto nach der Anmeldung.

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export async function createInvitation(
	ctx: OrgCtx,
	input: { email: string; role: MemberRole },
): Promise<{ invitationId: string; url: string; expiresAt: Date }> {
	const email = input.email.trim().toLowerCase();
	const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
	const invitationId = await mutateOrg(ctx, async (tx) => {
		await tx
			.update(invitations)
			.set({ status: "revoked" })
			.where(
				and(
					eq(invitations.organizationId, ctx.orgId),
					eq(invitations.email, email),
					eq(invitations.status, "pending"),
				),
			);
		const [inv] = await tx
			.insert(invitations)
			.values({
				organizationId: ctx.orgId,
				email,
				role: input.role,
				invitedBy: ctx.userId,
				expiresAt,
			})
			.returning({ id: invitations.id });
		if (!inv) throw new Error("invitation insert failed");
		return {
			result: inv.id,
			audit: {
				action: "member.invited",
				target: `invitation:${inv.id}`,
				after: { role: input.role },
			},
		};
	});
	const { url } = await issueLink(
		{ kind: "invite", invitationId, organizationId: ctx.orgId, email },
		expiresAt,
	);
	return { invitationId, url, expiresAt };
}

export type AcceptResult =
	| { ok: true; orgId: string }
	| { ok: false; error: "invalid" | "wrong_account" };

export async function acceptInvitation(
	who: {
		userId: string;
		email: string;
		sessionId: string;
		verifiedAt: Date | null;
		ip?: string | null;
		userAgent?: string | null;
	},
	input: { organizationId: string; invitationId: string },
): Promise<AcceptResult> {
	const inv = await openInvitation(input.organizationId, input.invitationId);
	if (!inv) return { ok: false, error: "invalid" };
	if (inv.email.toLowerCase() !== who.email.toLowerCase())
		return { ok: false, error: "wrong_account" };
	const ctx: OrgCtx = {
		orgId: input.organizationId,
		userId: who.userId,
		ip: who.ip,
		userAgent: who.userAgent,
	};
	await mutateOrg(ctx, async (tx) => {
		const [m] = await tx
			.insert(members)
			.values({
				organizationId: input.organizationId,
				userId: who.userId,
				role: inv.role,
			})
			.onConflictDoNothing()
			.returning({ id: members.id });
		await tx
			.update(invitations)
			.set({
				status: "accepted",
				acceptedAt: new Date(),
				acceptedBy: who.userId,
			})
			.where(eq(invitations.id, inv.id));
		return {
			result: undefined,
			audit: {
				action: "member.joined",
				target: `member:${m?.id ?? who.userId}`,
				after: { role: inv.role, invitationId: inv.id },
			},
		};
	});
	await joinSessionOrg(who.sessionId, input.organizationId, who.verifiedAt);
	return { ok: true, orgId: input.organizationId };
}
