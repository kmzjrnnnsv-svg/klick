import { and, desc, eq, inArray } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	invitation,
	member,
	organization,
	session,
	ssoProvider,
	user,
} from "@/db/auth-schema";
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
			grants: memberAccess.grants,
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

// SSO-Provider der Org (ohne Client-Secret) für /einstellungen?tab=sso.
export async function listSsoProvidersForOrg(orgId: string) {
	const rows = await globalDb
		.select({
			id: ssoProvider.id,
			providerId: ssoProvider.providerId,
			issuer: ssoProvider.issuer,
			domain: ssoProvider.domain,
			domainVerified: ssoProvider.domainVerified,
			oidcConfig: ssoProvider.oidcConfig,
		})
		.from(ssoProvider)
		.where(eq(ssoProvider.organizationId, orgId))
		.orderBy(ssoProvider.domain);
	return rows.map((r) => {
		let cfg: Record<string, unknown> = {};
		try {
			cfg = r.oidcConfig
				? (JSON.parse(r.oidcConfig) as Record<string, unknown>)
				: {};
		} catch {
			cfg = {};
		}
		return {
			id: r.id,
			providerId: r.providerId,
			issuer: r.issuer,
			domain: r.domain,
			domainVerified: Boolean(r.domainVerified),
			clientId: typeof cfg.clientId === "string" ? cfg.clientId : null,
			discoveryEndpoint:
				typeof cfg.discoveryEndpoint === "string"
					? cfg.discoveryEndpoint
					: null,
		};
	});
}

// Alle Sitzungen der Org-Mitglieder beenden (Org-Löschung, Notfall).
// Optional den Akteur ausnehmen, damit er den Vorgang abschließen kann.
export async function revokeSessionsOfOrgMembers(
	orgId: string,
	exceptUserId?: string,
): Promise<number> {
	const members = await globalDb
		.select({ userId: member.userId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const ids = members.map((m) => m.userId).filter((id) => id !== exceptUserId);
	if (ids.length === 0) return 0;
	const deleted = await globalDb
		.delete(session)
		.where(inArray(session.userId, ids))
		.returning({ id: session.id });
	return deleted.length;
}
