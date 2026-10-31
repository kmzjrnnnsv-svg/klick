import { and, eq } from "drizzle-orm";
import { ssoProvider } from "@/db/auth-schema";
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

/**
 * Vorgemerktes Zertifikat übernehmen (AP10c, Wirkung der Vier-Augen-Art
 * sso_saml_cert). Nur, wenn Vormerkung und heutiges Zertifikat noch dem
 * Antrag entsprechen und die Metadaten denselben Anbieter beschreiben
 * (gleiche Entity-ID). Schreibt die Verbindung in derselben Transaktion
 * (sso_provider ohne RLS, ADR-015, gefiltert über die Org). Rückgabe: Code
 * bei Ablehnung, sonst null.
 */
export async function adoptNextMetadata(
	tx: OrgTx,
	orgId: string,
	input: { providerId: string; next: string; current: string | null },
	now = new Date(),
): Promise<string | null> {
	const [st] = await tx
		.select()
		.from(ssoProviderStates)
		.where(
			and(
				eq(ssoProviderStates.organizationId, orgId),
				eq(ssoProviderStates.providerId, input.providerId),
			),
		)
		.limit(1);
	if (
		!st?.nextMetadata ||
		st.nextCertFingerprints !== input.next ||
		(st.certFingerprints ?? null) !== input.current
	)
		return "four_eyes_stale";
	const m = readIdpMetadata(st.nextMetadata, now);
	if (!m.ok || fingerprintSet(m.metadata.certificates) !== input.next)
		return "four_eyes_stale";
	const [p] = await tx
		.select({ issuer: ssoProvider.issuer, samlConfig: ssoProvider.samlConfig })
		.from(ssoProvider)
		.where(
			and(
				eq(ssoProvider.providerId, input.providerId),
				eq(ssoProvider.organizationId, orgId),
			),
		)
		.limit(1);
	if (!p?.samlConfig) return "four_eyes_stale";
	if (m.metadata.entityId !== p.issuer) return "sso_cert_entity_changed";
	let cfg: Record<string, unknown>;
	try {
		cfg = JSON.parse(p.samlConfig) as Record<string, unknown>;
	} catch {
		return "four_eyes_stale";
	}
	const next = {
		...cfg,
		cert: undefined,
		entryPoint: m.metadata.ssoUrl ?? cfg.entryPoint,
		idpMetadata: { metadata: st.nextMetadata },
	};
	await tx
		.update(ssoProvider)
		.set({ samlConfig: JSON.stringify(next) })
		.where(
			and(
				eq(ssoProvider.providerId, input.providerId),
				eq(ssoProvider.organizationId, orgId),
			),
		);
	await upsertProviderState(tx, orgId, input.providerId, {
		...certPatch(m.metadata.certificates),
		nextMetadata: null,
		nextCertFingerprints: null,
		nextCertNotAfter: null,
		nextSeenAt: null,
	});
	return null;
}
