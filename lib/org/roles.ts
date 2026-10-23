import { and, asc, eq, inArray } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import { approvalWorkflows, memberRoles, orgRoles } from "@/db/schema";
import {
	effectivePermissions,
	sanitizePermissions,
} from "@/lib/auth/permission-catalog";
import {
	type OrgRole,
	permissionsAllow,
	type RolePermissions,
} from "@/lib/auth/permissions";
import { normalizeRole } from "@/lib/auth/session-rules";
import type { OrgTx } from "@/lib/db/with-org";

// Eigene Rollen (ADR-020) — Lesen im Org-Kontext. Rechte immer bereinigt
// (sanitizePermissions), damit Altbestände nie mehr als der Katalog geben.

export type OrgRoleRow = {
	id: string;
	name: string;
	description: string | null;
	permissions: RolePermissions;
	members: {
		memberId: string | null;
		userId: string | null;
		pendingEmail: string | null;
	}[];
};

export async function listOrgRoles(
	tx: OrgTx,
	orgId: string,
): Promise<OrgRoleRow[]> {
	const roles = await tx
		.select()
		.from(orgRoles)
		.where(eq(orgRoles.organizationId, orgId))
		.orderBy(asc(orgRoles.name));
	if (roles.length === 0) return [];
	const links = await tx
		.select({
			roleId: memberRoles.roleId,
			memberId: memberRoles.memberId,
			userId: memberRoles.userId,
			pendingEmail: memberRoles.pendingEmail,
		})
		.from(memberRoles)
		.where(
			and(
				eq(memberRoles.organizationId, orgId),
				inArray(
					memberRoles.roleId,
					roles.map((r) => r.id),
				),
			),
		);
	return roles.map((r) => ({
		id: r.id,
		name: r.name,
		description: r.description,
		permissions: sanitizePermissions(r.permissions),
		members: links
			.filter((l) => l.roleId === r.id)
			.map(({ memberId, userId, pendingEmail }) => ({
				memberId,
				userId,
				pendingEmail,
			})),
	}));
}

// Mitglieder, deren effektive Rechte (Grundrolle ∪ eigene Rollen) die
// verlangten Rechte enthalten — z. B. Empfänger:innen von Wallet-Meldungen
export async function membersAllowed(
	tx: OrgTx,
	orgId: string,
	required: Parameters<typeof permissionsAllow>[1],
): Promise<string[]> {
	const members = await tx
		.select({ memberId: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const custom = await tx
		.select({
			memberId: memberRoles.memberId,
			permissions: orgRoles.permissions,
		})
		.from(memberRoles)
		.innerJoin(orgRoles, eq(orgRoles.id, memberRoles.roleId))
		.where(eq(memberRoles.organizationId, orgId));
	return members
		.filter((m) =>
			permissionsAllow(
				effectivePermissions(
					normalizeRole(m.role) as OrgRole,
					custom
						.filter((c) => c.memberId === m.memberId)
						.map((c) => c.permissions),
				),
				required,
			),
		)
		.map((m) => m.userId);
}

// Eigene Rollen je Mitglied (für Team-Badges)
export async function rolesByMember(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, { id: string; name: string }[]>> {
	const rows = await tx
		.select({
			memberId: memberRoles.memberId,
			id: orgRoles.id,
			name: orgRoles.name,
		})
		.from(memberRoles)
		.innerJoin(orgRoles, eq(orgRoles.id, memberRoles.roleId))
		.where(eq(memberRoles.organizationId, orgId))
		.orderBy(asc(orgRoles.name));
	const out = new Map<string, { id: string; name: string }[]>();
	for (const r of rows) {
		if (!r.memberId) continue;
		const list = out.get(r.memberId) ?? [];
		list.push({ id: r.id, name: r.name });
		out.set(r.memberId, list);
	}
	return out;
}

// Steht die Rolle in einer Freigabestufe? (role:<id> in Freigebenden oder
// „Entfällt, wenn …“) — dann darf sie nicht gelöscht werden.
export function stepsUseRole(steps: unknown, roleId: string): boolean {
	return JSON.stringify(steps ?? []).includes(`role:${roleId}`);
}

export async function workflowsUsingRole(
	tx: OrgTx,
	orgId: string,
	roleId: string,
): Promise<string[]> {
	const rows = await tx
		.select({
			name: approvalWorkflows.name,
			steps: approvalWorkflows.steps,
		})
		.from(approvalWorkflows)
		.where(eq(approvalWorkflows.organizationId, orgId));
	return rows.filter((w) => stepsUseRole(w.steps, roleId)).map((w) => w.name);
}
