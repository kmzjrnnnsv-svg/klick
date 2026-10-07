import { and, desc, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { invitation, member, organization, user } from "@/db/auth-schema";
import { memberAccess } from "@/db/schema";

// Org-Stammdaten aus den Better-Auth-Tabellen (kein RLS, daher immer explizit
// nach organizationId gefiltert). Nur aus lib/auth/* heraus benutzen.

export async function getOrgSummary(orgId: string) {
	const [org] = await globalDb
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
		})
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return org ?? null;
}

export async function listOrgMembers(orgId: string) {
	return globalDb
		.select({
			memberId: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			role: member.role,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: member.createdAt,
			accessUntil: memberAccess.accessUntil,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.leftJoin(memberAccess, eq(memberAccess.memberId, member.id))
		.where(eq(member.organizationId, orgId))
		.orderBy(member.createdAt);
}

export async function listPendingInvitations(orgId: string) {
	return globalDb
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			createdAt: invitation.createdAt,
		})
		.from(invitation)
		.where(
			and(
				eq(invitation.organizationId, orgId),
				eq(invitation.status, "pending"),
			),
		)
		.orderBy(desc(invitation.createdAt));
}
