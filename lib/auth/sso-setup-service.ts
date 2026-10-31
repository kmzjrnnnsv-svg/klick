import { and, eq } from "drizzle-orm";
import { ssoProviderStates } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { safeFetch } from "@/lib/security/quick-check/fetcher";
import {
	type CertInfo,
	fingerprintSet,
	type IdpMetadata,
	latestNotAfter,
	parseIdpMetadata,
} from "./saml-metadata";
import { SAML_SECURITY } from "./sso-policy";
import { metadataUrlAllowed, type SamlVendor } from "./sso-saml-vendors";

// SAML in fünf Minuten (AP10): Metadaten des Anbieters holen und den Stand je
// Anbieter in sso_provider_states führen. Abruf nur über safeFetch (öffentliche,
// angeheftete IP), nur von den Hosts des Anbieters bzw. der eigenen Domain,
// ohne Weiterleitung, höchstens so groß wie das Plugin annimmt.

export type MetadataFetch =
	| { ok: true; xml: string; metadata: IdpMetadata }
	| { ok: false; error: string };

export async function fetchIdpMetadata(
	url: string,
	vendor: SamlVendor,
	orgDomains: readonly string[],
	now = new Date(),
): Promise<MetadataFetch> {
	if (!metadataUrlAllowed(url, vendor, orgDomains))
		return { ok: false, error: "sso_metadata_url" };
	const r = await safeFetch(url, {
		budget: { requests: 1, deadline: Date.now() + 10_000 },
		maxBytes: SAML_SECURITY.maxMetadataSize + 1,
		maxRedirects: 0,
	});
	if (!r.ok || r.res.status !== 200)
		return { ok: false, error: "sso_metadata_fetch" };
	if (r.res.truncated) return { ok: false, error: "sso_metadata_too_large" };
	return readIdpMetadata(r.res.body, now);
}

export function readIdpMetadata(xml: string, now = new Date()): MetadataFetch {
	const parsed = parseIdpMetadata(xml, now);
	if (!parsed.ok) return { ok: false, error: `sso_${parsed.error}` };
	return { ok: true, xml, metadata: parsed.data };
}

export type ProviderStatePatch = Partial<
	Omit<
		typeof ssoProviderStates.$inferInsert,
		"id" | "organizationId" | "providerId" | "createdAt"
	>
>;

/** Stand eines Anbieters anlegen bzw. ändern (in der Transaktion des Aufrufs). */
export async function upsertProviderState(
	tx: OrgTx,
	orgId: string,
	providerId: string,
	patch: ProviderStatePatch,
): Promise<void> {
	await tx
		.insert(ssoProviderStates)
		.values({ organizationId: orgId, providerId, ...patch })
		.onConflictDoUpdate({
			target: [ssoProviderStates.organizationId, ssoProviderStates.providerId],
			set: { ...patch, updatedAt: new Date() },
		});
}

export function certPatch(certs: readonly CertInfo[]): ProviderStatePatch {
	const notAfter = latestNotAfter(certs);
	return {
		certFingerprints: fingerprintSet(certs),
		certNotAfter: notAfter ? new Date(notAfter) : null,
	};
}

export async function providerStates(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(ssoProviderStates)
		.where(eq(ssoProviderStates.organizationId, orgId));
}

export async function deleteProviderState(
	tx: OrgTx,
	orgId: string,
	providerId: string,
): Promise<void> {
	await tx
		.delete(ssoProviderStates)
		.where(
			and(
				eq(ssoProviderStates.organizationId, orgId),
				eq(ssoProviderStates.providerId, providerId),
			),
		);
}
