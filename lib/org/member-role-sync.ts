import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import { memberRoles, orgRoles, roleAssignments } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { canHoldCustomRoles } from "@/lib/auth/permission-catalog";
import { normalizeRole } from "@/lib/auth/session-rules";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";

// Eigene Rollen als Funktion (ADR-024): wer eine eigene Rolle trägt, steht in
// role_assignments (function = other, orgRoleId) und wird wie jede Funktion
// von der Geschäftsleitung bestellt. Die Rechte der Rolle (member_roles,
// ADR-020) folgen der Bestellung — nur bestellte Inhaber:innen, nie
// Vertretungen, nie Externe (ADR-018). Einziger Schreiber von member_roles
// ist syncMemberRoles; aufgerufen nach jeder Bestellung/Abberufung einer
// eigenen Rolle und täglich im Tick.

const emailKey = (e: string) => e.trim().toLowerCase();

export async function syncMemberRoles(
	tx: OrgTx,
	orgId: string,
	actorUserId: string | null,
): Promise<AuditInput[]> {
	const held = await tx
		.select({
			roleId: roleAssignments.orgRoleId,
			userId: roleAssignments.userId,
			pendingEmail: roleAssignments.pendingEmail,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				isNotNull(roleAssignments.orgRoleId),
				effectiveAssignment(),
			),
		);
	const members = await tx
		.select({ id: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const internal = new Map(
		members
			.filter((m) => canHoldCustomRoles(normalizeRole(m.role)))
			.map((m) => [m.userId, m.id]),
	);
	// gewünschter Stand: Rolle × Person (Konto) bzw. Rolle × Adresse (Einladung)
	const wanted = new Map<
		string,
		{
			roleId: string;
			userId: string | null;
			memberId: string | null;
			email: string | null;
		}
	>();
	for (const h of held) {
		if (!h.roleId) continue;
		if (h.userId) {
			const memberId = internal.get(h.userId);
			if (memberId)
				wanted.set(`${h.roleId}|u:${h.userId}`, {
					roleId: h.roleId,
					userId: h.userId,
					memberId,
					email: null,
				});
		} else if (h.pendingEmail) {
			const email = emailKey(h.pendingEmail);
			wanted.set(`${h.roleId}|e:${email}`, {
				roleId: h.roleId,
				userId: null,
				memberId: null,
				email,
			});
		}
	}
	const current = await tx
		.select({
			id: memberRoles.id,
			roleId: memberRoles.roleId,
			userId: memberRoles.userId,
			pendingEmail: memberRoles.pendingEmail,
		})
		.from(memberRoles)
		.where(eq(memberRoles.organizationId, orgId));
	const keyOf = (r: (typeof current)[number]) =>
		r.userId
			? `${r.roleId}|u:${r.userId}`
			: `${r.roleId}|e:${emailKey(r.pendingEmail ?? "")}`;
	const have = new Set(current.map(keyOf));
	const removed = current.filter((r) => !wanted.has(keyOf(r)));
	if (removed.length > 0)
		await tx.delete(memberRoles).where(
			and(
				eq(memberRoles.organizationId, orgId),
				inArray(
					memberRoles.id,
					removed.map((r) => r.id),
				),
			),
		);
	const added = [...wanted.entries()].filter(([k]) => !have.has(k));
	for (const [, w] of added)
		await tx.insert(memberRoles).values({
			organizationId: orgId,
			roleId: w.roleId,
			memberId: w.memberId,
			userId: w.userId,
			pendingEmail: w.email,
			createdByUserId: actorUserId,
		});
	if (added.length === 0 && removed.length === 0) return [];
	const roleIds = [
		...new Set([
			...added.map(([, w]) => w.roleId),
			...removed.map((r) => r.roleId),
		]),
	];
	const names = new Map(
		(
			await tx
				.select({ id: orgRoles.id, name: orgRoles.name })
				.from(orgRoles)
				.where(
					and(
						eq(orgRoles.organizationId, orgId),
						inArray(orgRoles.id, roleIds),
					),
				)
		).map((r) => [r.id, r.name]),
	);
	for (const [, w] of added)
		if (w.userId)
			await notify(tx, {
				orgId,
				recipients: [w.userId],
				actorUserId,
				kind: "entity_changed",
				title: `Neue Rolle in Klick: ${names.get(w.roleId) ?? "Rolle"}`,
				body: "Mit der Bestellung gelten die Rechte dieser Rolle.",
				link: "/heute",
			});
	return [
		{
			action: "member_roles.synced",
			target: `organization:${orgId}`,
			after: {
				added: added.map(([, w]) => ({
					roleId: w.roleId,
					userId: w.userId,
					invited: Boolean(w.email),
				})),
				removed: removed.map((r) => ({
					roleId: r.roleId,
					userId: r.userId,
					invited: !r.userId,
				})),
			},
		},
	];
}
