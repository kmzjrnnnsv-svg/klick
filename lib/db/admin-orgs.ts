import { and, count, eq, inArray, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import {
	member,
	organization,
	passkey,
	ssoProvider,
	user,
} from "@/db/auth-schema";
import {
	frameworks,
	orgFrameworks,
	orgSettings,
	securityChanges,
} from "@/db/schema";
import { ssoPolicyOf } from "@/lib/auth/sso-policy";
import { networkPolicyOf } from "@/lib/net/network-policy";
import { setupState } from "@/lib/setup/steps";

// Lader für Admin > Organisationen (Admin-Portal, Teil 2). Nur Betriebs-
// daten (Namen, Zähler, Status, Plattform-Einstellungen), nie Inhalte der Org
// (Lockbox, Härtung A3). Was unter RLS steht, liest die Seite über
// withPlatform (auditiert); member, sso_provider und organization tragen
// keine RLS (ADR-009/015).

export async function adminOrg(orgId: string) {
	const [org] = await globalDb
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			createdAt: organization.createdAt,
		})
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	return org ?? null;
}

export type AdminMember = {
	userId: string;
	name: string;
	email: string;
	role: string;
	passkeys: number;
	totp: boolean;
	banned: boolean;
};

export async function adminOrgMembers(orgId: string): Promise<AdminMember[]> {
	const rows = await globalDb
		.select({
			userId: user.id,
			name: user.name,
			email: user.email,
			role: member.role,
			totp: user.twoFactorEnabled,
			banned: user.banned,
			passkeys: sql<number>`(select count(*)::int from ${passkey} p where p.user_id = ${user}.id)`,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(member.role, user.name);
	return rows.map((r) => ({
		...r,
		passkeys: Number(r.passkeys),
		totp: Boolean(r.totp),
		banned: Boolean(r.banned),
	}));
}

export async function adminOrgSso(orgId: string) {
	const rows = await globalDb
		.select({
			providerId: ssoProvider.providerId,
			domain: ssoProvider.domain,
			verified: ssoProvider.domainVerified,
			saml: sql<boolean>`${ssoProvider.samlConfig} is not null`,
		})
		.from(ssoProvider)
		.where(eq(ssoProvider.organizationId, orgId));
	return rows.map((r) => ({ ...r, verified: Boolean(r.verified) }));
}

// Plattform-Scope (withPlatform): Einstellungen, Rahmenwerke, offene
// Sicherheitsänderungen — nur Status, keine Werte.
export async function adminOrgSettings(tx: DbTx, orgId: string) {
	const [s] = await tx
		.select({
			licenceStage: orgSettings.licenceStage,
			setupFlags: orgSettings.setupFlags,
			ssoPolicy: orgSettings.ssoPolicy,
			networkPolicy: orgSettings.networkPolicy,
			governanceMode: orgSettings.governanceMode,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const fws = await tx
		.select({ slug: frameworks.slug, name: frameworks.name })
		.from(orgFrameworks)
		.innerJoin(frameworks, eq(frameworks.id, orgFrameworks.frameworkId))
		.where(eq(orgFrameworks.organizationId, orgId))
		.orderBy(frameworks.name);
	const [pending] = await tx
		.select({ n: count() })
		.from(securityChanges)
		.where(
			and(
				eq(securityChanges.organizationId, orgId),
				inArray(securityChanges.status, ["pending", "waiting", "approved"]),
			),
		);
	if (!s) return null;
	const network = networkPolicyOf(s.networkPolicy);
	return {
		licenceStage: s.licenceStage,
		governanceMode: s.governanceMode,
		setup: setupState(s.setupFlags),
		sso: ssoPolicyOf(s.ssoPolicy),
		networkActive: network.members.length > 0,
		frameworks: fws,
		pendingSecurityChanges: Number(pending?.n ?? 0),
	};
}
