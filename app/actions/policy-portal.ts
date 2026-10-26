"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { accessTokens, type PortalDomain, policyPortals } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { listSsoProvidersForOrg } from "@/lib/auth/org";
import { mutateOrg } from "@/lib/db/with-org";
import { ensurePortal, orgNameAndSlug } from "@/lib/policy-portal/admin";
import { portalTxtState } from "@/lib/policy-portal/dns";
import {
	clampSessionDays,
	normalizeDomain,
	portalSlugValid,
	txtRecordName,
	txtRecordValue,
} from "@/lib/policy-portal/rules";
import { isUniqueViolation } from "@/lib/trust/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	portalDomainSchema,
	portalReaderSchema,
	portalSettingsSchema,
} from "@/lib/validation/policy-portal";

// Einstellungen > Richtlinien-Portal (M2): nur Inhaber:innen (settings:update)
// mit frischem Step-up. Domains gelten erst bestätigt — per TXT-Eintrag oder
// als verifizierte SSO-Domain der Org.

const guard = () => requireStepUp({ settings: ["update"] });

async function savePolicyPortalImpl(input: unknown): Promise<ActionResult> {
	const c = await guard();
	const parsed = portalSettingsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (!portalSlugValid(d.slug)) return { ok: false, error: "portal_slug" };
	try {
		const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
			const before = await ensurePortal(tx, c.orgId);
			if (d.enabled && !before.domains.some((x) => x.verifiedAt))
				return {
					result: { ok: false, error: "portal_no_domain" },
					audit: [],
				};
			const org = await orgNameAndSlug(tx, c.orgId);
			const after = {
				enabled: d.enabled,
				slug: d.slug,
				sessionDays: clampSessionDays(d.sessionDays),
			};
			await tx
				.update(policyPortals)
				.set({ ...after, orgName: org.name, updatedAt: new Date() })
				.where(eq(policyPortals.id, before.id));
			return {
				result: { ok: true, data: undefined },
				audit: {
					action: "policy_portal.updated",
					target: `policy_portal:${before.id}`,
					before: {
						enabled: before.enabled,
						slug: before.slug,
						sessionDays: before.sessionDays,
					},
					after,
				},
			};
		});
		revalidatePath("/einstellungen");
		return res;
	} catch (e) {
		if (isUniqueViolation(e)) return { ok: false, error: "portal_slug_taken" };
		throw e;
	}
}

async function addPortalDomainImpl(
	input: unknown,
): Promise<ActionResult<{ recordName: string; recordValue: string | null }>> {
	const c = await guard();
	const parsed = portalDomainSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const domain = normalizeDomain(parsed.data.domain);
	if (!domain) return { ok: false, error: "portal_domain_invalid" };
	// verifizierte SSO-Domain der Org gilt sofort
	const sso = (await listSsoProvidersForOrg(c.orgId)).some(
		(p) => p.domainVerified && normalizeDomain(p.domain) === domain,
	);
	const res = await mutateOrg<
		ActionResult<{ recordName: string; recordValue: string | null }>
	>(toOrgCtx(c), async (tx) => {
		const portal = await ensurePortal(tx, c.orgId);
		const existing = portal.domains.find((x) => x.domain === domain);
		const entry: PortalDomain = existing ?? {
			domain,
			token: randomBytes(16).toString("hex"),
			verifiedAt: sso ? new Date().toISOString() : null,
			via: sso ? "sso" : null,
		};
		if (!existing) {
			if (portal.domains.length >= 20)
				return {
					result: { ok: false, error: "portal_domains_full" },
					audit: [],
				};
			await tx
				.update(policyPortals)
				.set({ domains: [...portal.domains, entry], updatedAt: new Date() })
				.where(eq(policyPortals.id, portal.id));
		}
		return {
			result: {
				ok: true,
				data: {
					recordName: txtRecordName(domain),
					recordValue: entry.verifiedAt ? null : txtRecordValue(entry.token),
				},
			},
			audit: existing
				? []
				: {
						action: "policy_portal.domain_added",
						target: `policy_portal:${portal.id}`,
						after: { domain, via: entry.via },
					},
		};
	});
	revalidatePath("/einstellungen");
	return res;
}

async function verifyPortalDomainImpl(input: unknown): Promise<ActionResult> {
	const c = await guard();
	const parsed = portalDomainSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const domain = normalizeDomain(parsed.data.domain);
	if (!domain) return { ok: false, error: "portal_domain_invalid" };
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const portal = await ensurePortal(tx, c.orgId);
		const entry = portal.domains.find((x) => x.domain === domain);
		if (!entry) return { result: { ok: false, error: "notFound" }, audit: [] };
		if (entry.verifiedAt)
			return { result: { ok: true, data: undefined }, audit: [] };
		const state = await portalTxtState(domain, entry.token);
		if (state !== "ok")
			return {
				result: {
					ok: false,
					error:
						state === "missing" ? "portal_dns_missing" : "portal_dns_mismatch",
				},
				audit: [],
			};
		await tx
			.update(policyPortals)
			.set({
				domains: portal.domains.map((x) =>
					x.domain === domain
						? {
								...x,
								verifiedAt: new Date().toISOString(),
								via: "dns" as const,
							}
						: x,
				),
				updatedAt: new Date(),
			})
			.where(eq(policyPortals.id, portal.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "policy_portal.domain_verified",
				target: `policy_portal:${portal.id}`,
				after: { domain, via: "dns" },
			},
		};
	});
	revalidatePath("/einstellungen");
	return res;
}

// Domain entfernen: Leser:innen dieser Domain verlieren den Zugang sofort
// (resolvePortalReader prüft die Domain bei jedem Aufruf). Die letzte
// bestätigte Domain eines eingeschalteten Portals bleibt.
async function removePortalDomainImpl(input: unknown): Promise<ActionResult> {
	const c = await guard();
	const parsed = portalDomainSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const domain = normalizeDomain(parsed.data.domain);
	if (!domain) return { ok: false, error: "portal_domain_invalid" };
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const portal = await ensurePortal(tx, c.orgId);
		const rest = portal.domains.filter((x) => x.domain !== domain);
		if (rest.length === portal.domains.length)
			return { result: { ok: false, error: "notFound" }, audit: [] };
		if (portal.enabled && !rest.some((x) => x.verifiedAt))
			return { result: { ok: false, error: "portal_last_domain" }, audit: [] };
		await tx
			.update(policyPortals)
			.set({ domains: rest, updatedAt: new Date() })
			.where(eq(policyPortals.id, portal.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "policy_portal.domain_removed",
				target: `policy_portal:${portal.id}`,
				before: { domain },
			},
		};
	});
	revalidatePath("/einstellungen");
	return res;
}

// Zugang einer Leser:in beenden: alle offenen Sitzungen widerrufen. Ein
// neuer Code bleibt möglich, solange die Domain freigegeben ist.
async function endPortalReaderAccessImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await guard();
	const parsed = portalReaderSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const revoked = await tx
			.update(accessTokens)
			.set({ revokedAt: new Date(), revokedByUserId: c.userId })
			.where(
				and(
					eq(accessTokens.organizationId, c.orgId),
					eq(accessTokens.kind, "policy_reader"),
					eq(accessTokens.subjectId, parsed.data.readerId),
					isNull(accessTokens.revokedAt),
				),
			)
			.returning({ id: accessTokens.id });
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "policy_portal.reader_access_ended",
				target: `policy_reader:${parsed.data.readerId}`,
				after: { sessions: revoked.length },
			},
		};
	});
	revalidatePath("/einstellungen");
	return res;
}

export const savePolicyPortal = safeAction(
	"savePolicyPortal",
	savePolicyPortalImpl,
);
export const addPortalDomain = safeAction(
	"addPortalDomain",
	addPortalDomainImpl,
);
export const verifyPortalDomain = safeAction(
	"verifyPortalDomain",
	verifyPortalDomainImpl,
);
export const removePortalDomain = safeAction(
	"removePortalDomain",
	removePortalDomainImpl,
);
export const endPortalReaderAccess = safeAction(
	"endPortalReaderAccess",
	endPortalReaderAccessImpl,
);
