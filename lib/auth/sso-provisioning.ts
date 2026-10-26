import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import {
	invitation,
	member,
	session as sessionTable,
	ssoProvider,
	user as userTable,
} from "@/db/auth-schema";
import { orgSettings } from "@/db/schema";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { auditPlatform } from "../audit";
import { membershipAllowed } from "./memberships";
import { normalizeRole } from "./session-rules";
import {
	groupsFrom,
	oidcMfa,
	roleFromGroups,
	type SsoPolicy,
	samlMfa,
	ssoGate,
	ssoPolicyOf,
} from "./sso-policy";

// SSO je Kunde (S1/S2): eigene Provisionierung statt
// organizationProvisioning — bei jeder SSO-Anmeldung (provisionUser mit
// provisionUserOnEveryLogin). Rolle aus Gruppen, Ein-Org-Regel (ADR-018),
// Firmen-MFA auf die eben angelegte Sitzung, „SSO erzwingen“.

export async function orgSsoPolicy(orgId: string): Promise<SsoPolicy> {
	return readOrg({ orgId, userId: null }, async (tx) => {
		const [s] = await tx
			.select({ ssoPolicy: orgSettings.ssoPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1);
		return ssoPolicyOf(s?.ssoPolicy);
	});
}

const domainOf = (email: string) =>
	email.slice(email.lastIndexOf("@") + 1).toLowerCase();

type ProvisionInput = {
	user: { id: string; email: string };
	userInfo: Record<string, unknown>;
	token?: { idToken?: string } | undefined;
	provider: {
		providerId: string;
		organizationId?: string | null;
		domain: string;
		issuer: string;
		domainVerified?: boolean;
	};
};

// ID-Token ist im Rückruf schon geprüft (Signatur, Aussteller, Zielgruppe);
// hier nur die Nutzlast lesen.
function idTokenClaims(idToken: string | undefined): Record<string, unknown> {
	const part = idToken?.split(".")[1];
	if (!part) return {};
	try {
		return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
	} catch {
		return {};
	}
}

export async function provisionSsoUser(p: ProvisionInput): Promise<void> {
	const orgId = p.provider.organizationId;
	if (!orgId || !p.provider.domainVerified) return;
	const email = p.user.email.toLowerCase();
	if (domainOf(email) !== p.provider.domain.toLowerCase()) return;
	const claims = { ...idTokenClaims(p.token?.idToken), ...p.userInfo };
	const saml = !p.token;
	// Google Workspace: hd muss zur Domain passen (private Konten haben keins)
	if (
		p.provider.issuer === "https://accounts.google.com" &&
		String(claims.hd ?? "").toLowerCase() !== p.provider.domain.toLowerCase()
	) {
		await auditPlatform(
			{ userId: p.user.id },
			{
				action: "sso.provision_skipped",
				target: `user:${p.user.id}`,
				after: { providerId: p.provider.providerId, reason: "google_hd" },
			},
		);
		return;
	}
	const policy = await orgSsoPolicy(orgId);
	const role = roleFromGroups(groupsFrom(claims, policy.groupClaim), policy);
	const mfa =
		policy.trustIdpMfa && (saml ? samlMfa(p.userInfo) : oidcMfa(claims));

	const memberships = await globalDb
		.select({
			id: member.id,
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, p.user.id));
	const here = memberships.find((m) => m.organizationId === orgId);
	let joined = false;
	if (!here) {
		const [pending] = await globalDb
			.select({ id: invitation.id })
			.from(invitation)
			.where(
				and(
					eq(invitation.organizationId, orgId),
					eq(invitation.email, email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			)
			.limit(1);
		const allowed = membershipAllowed(
			memberships.map((m) => normalizeRole(m.role)),
			role,
		);
		if (pending || !allowed.ok) {
			await auditPlatform(
				{ userId: p.user.id },
				{
					action: "sso.provision_skipped",
					target: `user:${p.user.id}`,
					after: {
						providerId: p.provider.providerId,
						organizationId: orgId,
						reason: pending
							? "invitation_pending"
							: allowed.ok
								? null
								: allowed.reason,
					},
				},
			);
		} else {
			await mutateOrg({ orgId, userId: p.user.id }, async (tx) => {
				await tx.insert(member).values({
					organizationId: orgId,
					userId: p.user.id,
					role,
					createdAt: new Date(),
				});
				return {
					result: null,
					audit: {
						action: "member.sso_provisioned",
						target: `user:${p.user.id}`,
						after: { role, providerId: p.provider.providerId },
					},
				};
			});
			joined = true;
		}
	} else {
		// Rolle aus Gruppen bei jeder Anmeldung — nie für Inhaber:innen und
		// externe Rollen (Prüfer:in, Berater:in), die Klick selbst vergibt
		const current = normalizeRole(here.role);
		if (
			current !== role &&
			(current === "employee" || current === "viewer" || current === "editor")
		)
			await mutateOrg({ orgId, userId: p.user.id }, async (tx) => {
				await tx.update(member).set({ role }).where(eq(member.id, here.id));
				return {
					result: null,
					audit: {
						action: "member.sso_role_changed",
						target: `user:${p.user.id}`,
						before: { role: current },
						after: { role, providerId: p.provider.providerId },
					},
				};
			});
	}

	// Die eben angelegte Sitzung: Org setzen (neu beigetreten) und Firmen-MFA
	// anerkennen. Step-up bleibt bei Passkey oder Code (stepUpAt = Epoche).
	if (!joined && !mfa) return;
	const [latest] = await globalDb
		.select({
			id: sessionTable.id,
			activeOrganizationId: sessionTable.activeOrganizationId,
			mfaVerifiedAt: sessionTable.mfaVerifiedAt,
		})
		.from(sessionTable)
		.where(
			and(
				eq(sessionTable.userId, p.user.id),
				gt(sessionTable.createdAt, new Date(Date.now() - 60_000)),
			),
		)
		.orderBy(desc(sessionTable.createdAt))
		.limit(1);
	if (!latest) return;
	const now = new Date();
	await globalDb
		.update(sessionTable)
		.set({
			...(joined && !latest.activeOrganizationId
				? { activeOrganizationId: orgId }
				: {}),
			...(mfa && !latest.mfaVerifiedAt
				? { mfaVerifiedAt: now, stepUpAt: new Date(0), lastActiveAt: now }
				: {}),
		})
		.where(eq(sessionTable.id, latest.id));
	if (mfa && !latest.mfaVerifiedAt)
		await auditPlatform(
			{ userId: p.user.id },
			{
				action: "auth.idp_mfa_accepted",
				target: `session:${latest.id}`,
				after: { providerId: p.provider.providerId, organizationId: orgId },
			},
		);
}

// „SSO erzwingen“ für die Anmeldung eines Kontos: verifizierte SSO-Domains
// mit erzwungener Anmeldung; Inhaber:innen der Org behalten den Notzugang.
export async function ssoGateForUser(
	userId: string,
	path: string | null | undefined,
): Promise<"allow" | "deny" | "bypass"> {
	const [u] = await globalDb
		.select({ email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);
	if (!u) return "allow";
	const providers = await globalDb
		.select({ organizationId: ssoProvider.organizationId })
		.from(ssoProvider)
		.where(
			and(
				sql`lower(${ssoProvider.domain}) = ${domainOf(u.email)}`,
				eq(ssoProvider.domainVerified, true),
			),
		);
	const orgIds = [
		...new Set(
			providers.flatMap((p) => (p.organizationId ? [p.organizationId] : [])),
		),
	];
	if (orgIds.length === 0) return "allow";
	const enforcing: { orgId: string; isOwner: boolean }[] = [];
	const owned = new Set(
		(
			await globalDb
				.select({ organizationId: member.organizationId, role: member.role })
				.from(member)
				.where(
					and(
						eq(member.userId, userId),
						inArray(member.organizationId, orgIds),
					),
				)
		)
			.filter((m) => normalizeRole(m.role) === "owner")
			.map((m) => m.organizationId),
	);
	for (const orgId of orgIds)
		if ((await orgSsoPolicy(orgId)).enforce)
			enforcing.push({ orgId, isOwner: owned.has(orgId) });
	return ssoGate({ path, enforcingOrgs: enforcing });
}
