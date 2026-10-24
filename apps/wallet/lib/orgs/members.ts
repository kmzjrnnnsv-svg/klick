import { user } from "@wallet/db/auth-schema";
import {
	auditLog,
	invitations,
	members,
	notifications,
} from "@wallet/db/schema";
import type { MemberRole } from "@wallet/db/schema/enums";
import { verifyAuditChain } from "@wallet/lib/audit";
import { mutateOrg, type OrgCtx, readOrg } from "@wallet/lib/db/with-org";
import { and, count, desc, eq, isNull } from "drizzle-orm";

// Mitglieder, Einladungen, Protokoll und Glocke einer Org (immer im
// Org-Kontext). Die letzte Inhaber:in bleibt (pure Regel ownerWouldVanish).

export type MemberRow = {
	id: string;
	userId: string;
	name: string;
	email: string;
	role: MemberRole;
	createdAt: Date;
};

export function ownerWouldVanish(
	rows: readonly Pick<MemberRow, "id" | "role">[],
	memberId: string,
	nextRole: MemberRole | null,
): boolean {
	const target = rows.find((r) => r.id === memberId);
	if (!target || target.role !== "owner" || nextRole === "owner") return false;
	return rows.filter((r) => r.role === "owner").length <= 1;
}

export async function listMembers(ctx: OrgCtx): Promise<MemberRow[]> {
	return readOrg(ctx, (tx) =>
		tx
			.select({
				id: members.id,
				userId: members.userId,
				name: user.name,
				email: user.email,
				role: members.role,
				createdAt: members.createdAt,
			})
			.from(members)
			.innerJoin(user, eq(user.id, members.userId))
			.orderBy(members.createdAt),
	);
}

export async function listOpenInvitations(ctx: OrgCtx) {
	return readOrg(ctx, (tx) =>
		tx
			.select({
				id: invitations.id,
				email: invitations.email,
				role: invitations.role,
				expiresAt: invitations.expiresAt,
			})
			.from(invitations)
			.where(eq(invitations.status, "pending"))
			.orderBy(desc(invitations.createdAt)),
	);
}

export type MemberChange =
	| { ok: true }
	| { ok: false; error: "not_found" | "last_owner" };

export async function changeMemberRole(
	ctx: OrgCtx,
	memberId: string,
	role: MemberRole,
): Promise<MemberChange> {
	return mutateOrg<MemberChange>(ctx, async (tx) => {
		const rows = await tx
			.select({ id: members.id, role: members.role })
			.from(members);
		const before = rows.find((r) => r.id === memberId);
		if (!before)
			return { result: { ok: false, error: "not_found" } as const, audit: [] };
		if (ownerWouldVanish(rows, memberId, role))
			return { result: { ok: false, error: "last_owner" } as const, audit: [] };
		await tx.update(members).set({ role }).where(eq(members.id, memberId));
		return {
			result: { ok: true } as const,
			audit: {
				action: "member.role_changed",
				target: `member:${memberId}`,
				before: { role: before.role },
				after: { role },
			},
		};
	});
}

export async function removeMember(
	ctx: OrgCtx,
	memberId: string,
): Promise<MemberChange> {
	return mutateOrg<MemberChange>(ctx, async (tx) => {
		const rows = await tx
			.select({ id: members.id, role: members.role })
			.from(members);
		const before = rows.find((r) => r.id === memberId);
		if (!before)
			return { result: { ok: false, error: "not_found" } as const, audit: [] };
		if (ownerWouldVanish(rows, memberId, null))
			return { result: { ok: false, error: "last_owner" } as const, audit: [] };
		await tx.delete(members).where(eq(members.id, memberId));
		return {
			result: { ok: true } as const,
			audit: {
				action: "member.removed",
				target: `member:${memberId}`,
				before: { role: before.role },
			},
		};
	});
}

export async function revokeInvitation(
	ctx: OrgCtx,
	id: string,
): Promise<boolean> {
	return mutateOrg(ctx, async (tx) => {
		const done = await tx
			.update(invitations)
			.set({ status: "revoked" })
			.where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
			.returning({ id: invitations.id });
		return {
			result: done.length > 0,
			audit: done.length
				? { action: "member.invitation_revoked", target: `invitation:${id}` }
				: [],
		};
	});
}

export async function auditTrail(ctx: OrgCtx, limit = 200) {
	return readOrg(ctx, async (tx) => {
		const rows = await tx
			.select({
				seq: auditLog.seq,
				at: auditLog.at,
				action: auditLog.action,
				target: auditLog.target,
				outcome: auditLog.outcome,
				actor: user.name,
			})
			.from(auditLog)
			.leftJoin(user, eq(user.id, auditLog.actorUserId))
			.where(eq(auditLog.organizationId, ctx.orgId))
			.orderBy(desc(auditLog.seq))
			.limit(limit);
		const chain = await verifyAuditChain(tx, ctx.orgId);
		return { rows, chain };
	});
}

export async function myNotifications(ctx: OrgCtx, limit = 15) {
	return readOrg(ctx, async (tx) => {
		const own = eq(notifications.userId, ctx.userId as string);
		const items = await tx
			.select({
				id: notifications.id,
				title: notifications.title,
				body: notifications.body,
				link: notifications.link,
				readAt: notifications.readAt,
				createdAt: notifications.createdAt,
			})
			.from(notifications)
			.where(own)
			.orderBy(desc(notifications.createdAt))
			.limit(limit);
		const [unread] = await tx
			.select({ n: count() })
			.from(notifications)
			.where(and(own, isNull(notifications.readAt)));
		return { items, unread: Number(unread?.n ?? 0) };
	});
}

export async function markNotificationsRead(ctx: OrgCtx): Promise<void> {
	await mutateOrg(ctx, async (tx) => {
		await tx
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notifications.userId, ctx.userId as string),
					isNull(notifications.readAt),
				),
			);
		return { result: undefined, audit: [] };
	});
}
