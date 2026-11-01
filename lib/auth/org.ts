import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { globalDb } from "@/db";
import {
	invitation,
	member,
	organization,
	passkey,
	session,
	ssoProvider,
	user,
} from "@/db/auth-schema";
import { memberAccess, memberRoles, orgRoles } from "@/db/schema";
import { readOrg } from "@/lib/db/with-org";
import { isExternal, membershipExpired } from "./memberships";
import { normalizeRole } from "./session-rules";

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

// member_access ist RLS-geschützt (FORCE): ohne Org-Kontext sieht die
// App-Rolle keine Zeile — Ablauf und Grants wären dann stillschweigend leer.
// Deshalb immer im Kontext der jeweiligen Org lesen.
export async function memberAccessFor(
	orgId: string,
	memberIds?: readonly string[],
) {
	if (memberIds && memberIds.length === 0) return [];
	return readOrg({ orgId, userId: null }, (tx) =>
		tx
			.select({
				memberId: memberAccess.memberId,
				accessUntil: memberAccess.accessUntil,
				grants: memberAccess.grants,
			})
			.from(memberAccess)
			.where(
				and(
					eq(memberAccess.organizationId, orgId),
					memberIds
						? inArray(memberAccess.memberId, [...memberIds])
						: undefined,
				),
			),
	);
}

// Ablauf, Grants und eigene Rollen (ADR-020) eines Mitglieds in EINER
// Org-Transaktion — für requireOrg je Request.
export async function memberContextFor(orgId: string, memberId: string) {
	return readOrg({ orgId, userId: null }, async (tx) => {
		const [access] = await tx
			.select({
				accessUntil: memberAccess.accessUntil,
				grants: memberAccess.grants,
			})
			.from(memberAccess)
			.where(
				and(
					eq(memberAccess.organizationId, orgId),
					eq(memberAccess.memberId, memberId),
				),
			)
			.limit(1);
		const roles = await tx
			.select({
				id: orgRoles.id,
				name: orgRoles.name,
				permissions: orgRoles.permissions,
			})
			.from(memberRoles)
			.innerJoin(orgRoles, eq(orgRoles.id, memberRoles.roleId))
			.where(
				and(
					eq(memberRoles.organizationId, orgId),
					eq(memberRoles.memberId, memberId),
				),
			)
			.orderBy(orgRoles.name);
		return { access: access ?? null, roles };
	});
}

export async function listOrgMembers(orgId: string) {
	const [rows, access] = await Promise.all([
		globalDb
			.select({
				memberId: member.id,
				userId: user.id,
				name: user.name,
				email: user.email,
				role: member.role,
				twoFactorEnabled: user.twoFactorEnabled,
				// qualifiziert — unqualifiziert zählte die Unterabfrage nie etwas
				passkeys: sql<number>`(select count(*)::int from ${passkey} p where p.user_id = ${user}.id)`,
				createdAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, orgId))
			.orderBy(member.createdAt),
		memberAccessFor(orgId),
	]);
	const byMember = new Map(access.map((a) => [a.memberId, a]));
	return rows.map((r) => ({
		...r,
		accessUntil: byMember.get(r.memberId)?.accessUntil ?? null,
		grants: byMember.get(r.memberId)?.grants ?? null,
	}));
}

// Alle Mitgliedschaften eines Kontos (Org-Umschalter, Auswahlseite,
// aktive Org beim Sitzungsstart) — mit Ablauf aus member_access.
// einmal je Anfrage (Rahmen und Seite); Ablauf nur für externe Zugänge —
// eigene Mitgliedschaften laufen nicht ab (ADR-018), also keine Abfrage je
// Org im Rahmen jeder Seite.
export const listUserMemberships = cache(async (userId: string) => {
	const rows = await globalDb
		.select({
			memberId: member.id,
			organizationId: member.organizationId,
			role: member.role,
			createdAt: member.createdAt,
			orgName: organization.name,
			orgSlug: organization.slug,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(eq(member.userId, userId))
		.orderBy(desc(member.createdAt));
	const now = Date.now();
	return Promise.all(
		rows.map(async (r) => {
			const role = normalizeRole(r.role);
			const [a] = isExternal(role)
				? await memberAccessFor(r.organizationId, [r.memberId])
				: [];
			const accessUntil = a?.accessUntil ?? null;
			return {
				...r,
				role,
				accessUntil,
				expired: membershipExpired({ accessUntil }, now),
			};
		}),
	);
});

export type UserMembership = Awaited<
	ReturnType<typeof listUserMemberships>
>[number];

// Rollen desselben Kontos in anderen Organisationen (Rollenwechsel prüfen,
// ADR-018). null, wenn das Mitglied nicht zu orgId gehört.
/** Grundrolle eines Mitglieds dieser Org (null = kein Mitglied hier). */
export async function memberRoleIn(
	memberId: string,
	orgId: string,
): Promise<string | null> {
	const [m] = await globalDb
		.select({ role: member.role })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
		.limit(1);
	return m?.role ?? null;
}

export async function rolesElsewhere(memberId: string, orgId: string) {
	const [m] = await globalDb
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
		.limit(1);
	if (!m) return null;
	const rows = await globalDb
		.select({ organizationId: member.organizationId, role: member.role })
		.from(member)
		.where(eq(member.userId, m.userId));
	return rows.filter((r) => r.organizationId !== orgId).map((r) => r.role);
}

// Step-up gilt nur für die Org, in der er bestätigt wurde: beim Wechsel
// oder Beitritt verfällt er (Epoche statt null, sonst zählt mfaVerifiedAt).
export async function expireStepUp(where: {
	sessionId?: string;
	userId?: string;
}) {
	const cond = where.sessionId
		? eq(session.id, where.sessionId)
		: where.userId
			? eq(session.userId, where.userId)
			: undefined;
	if (!cond) return;
	await globalDb
		.update(session)
		.set({ stepUpAt: new Date(0) })
		.where(cond);
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
			samlConfig: ssoProvider.samlConfig,
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
			protocol: (r.samlConfig ? "saml" : "oidc") as "saml" | "oidc",
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
