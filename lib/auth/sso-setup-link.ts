import { and, eq } from "drizzle-orm";
import { accessTokens, ssoSetupRequests } from "@/db/schema";
import { getOrgSummary } from "@/lib/auth/org";
import { mutateOrg, type OrgCtx, type OrgTx, readOrg } from "@/lib/db/with-org";
import { resolveToken } from "@/lib/db/with-token";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { newToken } from "@/lib/security/tokens";
import { isSamlVendor, type SamlVendor } from "./sso-saml-vendors";
import { readIdpMetadata } from "./sso-setup-service";

// Einrichtungslink für die IT (AP10d, ADR-017): Die Inhaberin schickt der
// IT einen Link (#klk_sso_… im Fragment, gegen ein httpOnly-Cookie unter
// /api/sso-einrichtung getauscht). Die IT sieht nur die SSO-Werte dieser
// Verbindung und schlägt die Metadaten vor; anlegen tut die Inhaberin mit
// Step-up. 7 Tage, ein Vorschlag je Link, danach nur noch lesen.

export const SETUP_LINK_DAYS = 7;
export const SETUP_COOKIE = "ks_sso";
export const SETUP_COOKIE_PATH = "/api/sso-einrichtung";
export const SETUP_SCOPE = "sso:propose";

export async function createSetupLink(
	tx: OrgTx,
	ctx: OrgCtx & { userId: string },
	input: { vendor: SamlVendor; domain: string; providerId: string },
	now = new Date(),
): Promise<{ token: string; requestId: string; expiresAt: Date }> {
	const expiresAt = new Date(now.getTime() + SETUP_LINK_DAYS * 86_400_000);
	const requestId = crypto.randomUUID();
	await tx.insert(ssoSetupRequests).values({
		id: requestId,
		organizationId: ctx.orgId,
		vendor: input.vendor,
		providerId: input.providerId,
		domain: input.domain,
		createdBy: ctx.userId,
		expiresAt,
	});
	const t = newToken("sso_setup");
	await tx.insert(accessTokens).values({
		organizationId: ctx.orgId,
		kind: "sso_setup",
		name: `SSO-Einrichtung ${input.domain}`,
		prefix: t.prefix,
		tokenHash: t.hash,
		scopes: [SETUP_SCOPE],
		subjectType: "sso_setup_request",
		subjectId: requestId,
		createdByUserId: ctx.userId,
		expiresAt,
	});
	return { token: t.token, requestId, expiresAt };
}

/** Link beenden (übernommen oder zurückgezogen): Token gesperrt. */
export async function closeSetupLink(
	tx: OrgTx,
	orgId: string,
	requestId: string,
	status: "applied" | "withdrawn",
	byUserId: string | null,
	now = new Date(),
): Promise<boolean> {
	const [row] = await tx
		.update(ssoSetupRequests)
		.set({ status, updatedAt: now })
		.where(
			and(
				eq(ssoSetupRequests.organizationId, orgId),
				eq(ssoSetupRequests.id, requestId),
			),
		)
		.returning({ id: ssoSetupRequests.id });
	await tx
		.update(accessTokens)
		.set({ revokedAt: now, revokedByUserId: byUserId })
		.where(
			and(
				eq(accessTokens.organizationId, orgId),
				eq(accessTokens.subjectType, "sso_setup_request"),
				eq(accessTokens.subjectId, requestId),
			),
		);
	return Boolean(row);
}

export type SetupView = {
	orgName: string;
	vendor: SamlVendor;
	domain: string;
	providerId: string;
	status: string;
	expiresAt: string;
	submittedAt: string | null;
};

export type ResolvedSetup = {
	orgId: string;
	tokenId: string;
	requestId: string;
	view: SetupView;
};

/** Token aus Link bzw. Cookie auflösen: nur offene, nicht abgelaufene Links. */
export async function resolveSetupLink(
	raw: string,
	now = new Date(),
): Promise<{ ok: true; setup: ResolvedSetup } | { ok: false; error: string }> {
	const r = await resolveToken(raw, "sso_setup", now);
	if (!r.ok) return { ok: false, error: r.error };
	const t = r.token;
	if (
		t.subjectType !== "sso_setup_request" ||
		!t.subjectId ||
		!t.scopes.includes(SETUP_SCOPE)
	)
		return { ok: false, error: "invalid" };
	const requestId = t.subjectId;
	const [row] = await readOrg({ orgId: t.organizationId, userId: null }, (tx) =>
		tx
			.select()
			.from(ssoSetupRequests)
			.where(
				and(
					eq(ssoSetupRequests.organizationId, t.organizationId),
					eq(ssoSetupRequests.id, requestId),
				),
			)
			.limit(1),
	);
	if (!row || !isSamlVendor(row.vendor)) return { ok: false, error: "invalid" };
	if (row.expiresAt <= now) return { ok: false, error: "expired" };
	if (row.status === "applied" || row.status === "withdrawn")
		return { ok: false, error: "revoked" };
	const org = await getOrgSummary(t.organizationId);
	return {
		ok: true,
		setup: {
			orgId: t.organizationId,
			tokenId: t.id,
			requestId,
			view: {
				orgName: org?.name ?? "",
				vendor: row.vendor,
				domain: row.domain,
				providerId: row.providerId,
				status: row.status,
				expiresAt: row.expiresAt.toISOString(),
				submittedAt: row.submittedAt?.toISOString() ?? null,
			},
		},
	};
}

export type SetupProposal = {
	contactName: string;
	metadataUrl?: string;
	metadataXml?: string;
	attributes: { email?: string; name?: string; groups?: string };
};

/** Vorschlag der IT speichern (einmal) und die Inhaber:innen benachrichtigen. */
export async function submitProposal(
	setup: ResolvedSetup,
	p: SetupProposal,
	meta: { ip: string | null; userAgent: string | null },
	now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (setup.view.status !== "open") return { ok: false, error: "submitted" };
	// XML gleich prüfen (die Adresse prüft Klick erst beim Anlegen, über die
	// Hosts des Anbieters)
	if (p.metadataXml) {
		const m = readIdpMetadata(p.metadataXml, now);
		if (!m.ok) return { ok: false, error: m.error };
	}
	return mutateOrg<{ ok: true } | { ok: false; error: string }>(
		{
			orgId: setup.orgId,
			userId: null,
			ip: meta.ip,
			userAgent: meta.userAgent,
		},
		async (tx) => {
			const [row] = await tx
				.update(ssoSetupRequests)
				.set({
					status: "submitted",
					metadataUrl: p.metadataUrl ?? null,
					metadataXml: p.metadataXml ?? null,
					attributes: p.attributes,
					contactName: p.contactName,
					submittedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(ssoSetupRequests.organizationId, setup.orgId),
						eq(ssoSetupRequests.id, setup.requestId),
						eq(ssoSetupRequests.status, "open"),
					),
				)
				.returning({ id: ssoSetupRequests.id });
			if (!row)
				return {
					result: { ok: false as const, error: "submitted" },
					audit: [],
				};
			const owners = await orgOwnerIds(tx, setup.orgId);
			await notify(tx, {
				orgId: setup.orgId,
				recipients: owners,
				actorUserId: null,
				kind: "security_change",
				title: `SSO: Die IT hat die Angaben für ${setup.view.domain} geschickt`,
				body: "Prüf sie unter Einstellungen > SSO und leg die Verbindung an.",
				link: "/einstellungen?tab=sso",
				payload: { dedupeKey: `sso-setup:${setup.requestId}` },
			});
			return {
				result: { ok: true as const },
				audit: {
					action: "sso.setup_proposed",
					target: `sso_setup_request:${setup.requestId}`,
					after: {
						via: "sso_setup_link",
						tokenId: setup.tokenId,
						contact: p.contactName,
						metadataUrl: p.metadataUrl ?? null,
						metadataXml: Boolean(p.metadataXml),
					},
				},
			};
		},
	);
}

export async function setupRequests(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(ssoSetupRequests)
		.where(eq(ssoSetupRequests.organizationId, orgId));
}
