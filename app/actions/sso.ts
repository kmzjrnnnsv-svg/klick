"use server";

import { inflateRawSync } from "node:zlib";
import { APIError } from "better-auth/api";
import { and, eq, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { orgSettings, ssoProbes } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { listSsoProvidersForOrg } from "@/lib/auth/org";
import {
	authnRequestId,
	type CertInfo,
	certificateInfo,
	certWarnings,
} from "@/lib/auth/saml-metadata";
import { auth } from "@/lib/auth/server";
import { AuthError } from "@/lib/auth/session-rules";
import { providerPreset, ssoPolicyOf } from "@/lib/auth/sso-policy";
import { PROBE_TTL_MS, probePath } from "@/lib/auth/sso-probe";
import { samlRegistration } from "@/lib/auth/sso-saml";
import { SAML_PRESETS } from "@/lib/auth/sso-saml-vendors";
import {
	certPatch,
	deleteProviderState,
	fetchIdpMetadata,
	readIdpMetadata,
	upsertProviderState,
} from "@/lib/auth/sso-setup-service";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { safeFetch } from "@/lib/security/quick-check/fetcher";
import {
	ssoChangeSummary,
	ssoPolicyCritical,
} from "@/lib/security-changes/rules";
import {
	requestApplyChange,
	requirePermit,
} from "@/lib/security-changes/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	discoveryTestSchema,
	isPublicHttpsUrl,
	registerOidcPresetSchema,
	registerSamlSchema,
	registerSsoSchema,
	samlPreviewSchema,
	ssoPolicySchema,
	ssoProviderIdSchema,
} from "@/lib/validation/sso";

// SSO je Organisation (OIDC über @better-auth/sso). Nur Owner mit Step-up;
// Client-Secret geht direkt an Better Auth (verschlüsselt gespeichert) und
// taucht in keinem Audit-Eintrag auf. Domain muss per DNS-TXT verifiziert
// werden, bevor Logins möglich sind.

async function stepUp(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		const ctx = await requireStepUp({ settings: ["update"] });
		if (ctx.orgRole !== "owner") return { ok: false, error: "forbidden" };
		return { ok: true, ctx };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
}

function mapError(e: unknown): { ok: false; error: string } {
	if (e instanceof APIError) return { ok: false, error: e.message || "error" };
	throw e;
}

const providerIdSchema = ssoProviderIdSchema;

async function registerSsoProviderImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = registerSsoSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const issuer = d.issuer.replace(/\/+$/, "");
	const scopes = (d.scopes ?? "openid email profile")
		.split(/[\s,]+/)
		.filter(Boolean);
	try {
		await auth.api.registerSSOProvider({
			body: {
				providerId: d.providerId,
				issuer,
				domain: d.domain,
				organizationId: c.orgId,
				oidcConfig: {
					issuer,
					clientId: d.clientId,
					clientSecret: d.clientSecret,
					discoveryEndpoint:
						d.discoveryEndpoint ?? `${issuer}/.well-known/openid-configuration`,
					pkce: true,
					scopes,
				},
			},
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.provider_registered",
			target: `sso_provider:${d.providerId}`,
			after: { domain: d.domain, issuer, scopes },
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

async function deleteSsoProviderImpl(
	providerId: string,
): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	// Vier-Augen (Härtung A4): eine SSO-Verbindung entfernen nur mit Erlaubnis
	// der zweiten Person (bzw. nach 24 h Wartezeit)
	const permit = await requirePermit(c, {
		kind: "sso_provider_remove",
		targetKey: parsed.data,
		summary: `SSO-Verbindung „${parsed.data}“ entfernen`,
	});
	if (!permit.ok) return permit;
	try {
		await auth.api.deleteSSOProvider({
			body: { providerId: parsed.data },
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await deleteProviderState(tx, c.orgId, parsed.data);
		return {
			result: null,
			audit: {
				action: "sso.provider_deleted",
				target: `sso_provider:${parsed.data}`,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// DNS-TXT-Token anfordern (Wert für _klick-sso.<domain>).
async function requestSsoDomainVerificationImpl(
	providerId: string,
): Promise<ActionResult<{ token: string }>> {
	const g = await stepUp();
	if (!g.ok) return g;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		const res = (await auth.api.requestDomainVerification({
			body: { providerId: parsed.data },
			headers: await headers(),
		})) as { domainVerificationToken?: string } | null;
		const token = res?.domainVerificationToken;
		if (!token) return { ok: false, error: "noToken" };
		return { ok: true, data: { token } };
	} catch (e) {
		return mapError(e);
	}
}

async function verifySsoDomainImpl(providerId: string): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		await auth.api.verifyDomain({
			body: { providerId: parsed.data },
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.domain_verified",
			target: `sso_provider:${parsed.data}`,
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const registerSsoProvider = safeAction(
	"registerSsoProvider",
	registerSsoProviderImpl,
);
export const deleteSsoProvider = safeAction(
	"deleteSsoProvider",
	deleteSsoProviderImpl,
);
export const requestSsoDomainVerification = safeAction(
	"requestSsoDomainVerification",
	requestSsoDomainVerificationImpl,
);
export const verifySsoDomain = safeAction(
	"verifySsoDomain",
	verifySsoDomainImpl,
);

// Geführte Einrichtung (S1): Issuer und Discovery aus der Anbieter-Vorlage.
async function registerOidcPresetImpl(input: unknown): Promise<ActionResult> {
	const parsed = registerOidcPresetSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const preset = providerPreset(d.kind, d);
	if (!preset || !isPublicHttpsUrl(preset.issuer))
		return { ok: false, error: "sso_preset_invalid" };
	return registerSsoProviderImpl({
		providerId: d.providerId,
		domain: d.domain,
		issuer: preset.issuer,
		discoveryEndpoint: preset.discoveryEndpoint,
		clientId: d.clientId,
		clientSecret: d.clientSecret,
		// Gruppen kommen bei Entra/Okta im ID-Token, wenn der Claim im IdP
		// eingerichtet ist; Google liefert keine Gruppen
		scopes: d.kind === "okta" ? "openid email profile groups" : undefined,
	});
}

// SAML 2.0 (S3, AP10): Anbieter-Vorlage, Metadaten als Adresse (Klick holt
// sie über safeFetch, nur Hosts des Anbieters), XML oder Entity-ID + SSO-URL
// + Zertifikat. Klick prüft Metadaten und Zertifikat selbst und merkt sich
// Ablauf und Adresse (sso_provider_states) für die tägliche Beobachtung.
// Klicks SP-Metadaten unter /api/auth/sso/saml2/sp/metadata?providerId=…
async function registerSamlProviderImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = registerSamlSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const preset = SAML_PRESETS[d.vendor];
	// Metadaten: Adresse vor XML vor Einzelfeldern
	let metadataXml: string | undefined;
	let certs: CertInfo[] = [];
	let idpEntityId = d.entityId ?? "";
	let ssoUrl = d.ssoUrl;
	if (d.metadataUrl || d.metadataXml) {
		const m = d.metadataUrl
			? await fetchIdpMetadata(d.metadataUrl, d.vendor, [d.domain])
			: readIdpMetadata(d.metadataXml ?? "");
		if (!m.ok) return { ok: false, error: m.error };
		metadataXml = m.xml;
		certs = m.metadata.certificates;
		idpEntityId = m.metadata.entityId;
		ssoUrl = m.metadata.ssoUrl ?? undefined;
	} else {
		const cert = certificateInfo(d.certificate ?? "");
		if (!cert) return { ok: false, error: "sso_cert_invalid" };
		certs = [cert];
	}
	if (!idpEntityId) return { ok: false, error: "sso_saml_entity" };
	const base = new URL(env().BETTER_AUTH_URL).origin;
	try {
		await auth.api.registerSSOProvider({
			body: {
				providerId: d.providerId,
				issuer: idpEntityId,
				domain: d.domain,
				organizationId: c.orgId,
				samlConfig: samlRegistration({
					origin: base,
					providerId: d.providerId,
					idpEntityId,
					ssoUrl,
					certificate: d.certificate,
					metadataXml,
					emailAttribute: d.emailAttribute || preset.attributes.email,
					nameAttribute: d.nameAttribute || preset.attributes.name,
					groupsAttribute:
						d.groupsAttribute || preset.attributes.groups || undefined,
				}),
			},
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	const state = certPatch(certs);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await upsertProviderState(tx, c.orgId, d.providerId, {
			vendor: d.vendor,
			metadataUrl: d.metadataUrl ?? null,
			...state,
			lastFetchAt: d.metadataUrl ? new Date() : null,
			lastFetchError: null,
		});
		return {
			result: null,
			audit: {
				action: "sso.provider_registered",
				target: `sso_provider:${d.providerId}`,
				after: {
					domain: d.domain,
					protocol: "saml",
					vendor: d.vendor,
					issuer: idpEntityId,
					metadataUrl: d.metadataUrl ?? null,
					certFingerprints: state.certFingerprints,
					certNotAfter: state.certNotAfter?.toISOString() ?? null,
				},
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

export type SamlPreview = {
	entityId: string | null;
	ssoUrl: string | null;
	certificates: {
		fingerprint: string;
		notAfter: string;
		subject: string;
		keyBits: number | null;
	}[];
	warnings: string[];
};

// Vorschau vor dem Anlegen (AP10): Metadaten holen bzw. lesen und zeigen,
// was Klick daraus übernimmt. Liest nur, kein Step-up.
async function previewSamlMetadataImpl(
	input: unknown,
): Promise<ActionResult<SamlPreview>> {
	const c = await requireOrg({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = samlPreviewSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const now = new Date();
	if (d.metadataUrl || d.metadataXml) {
		const m = d.metadataUrl
			? await fetchIdpMetadata(d.metadataUrl, d.vendor, [d.domain], now)
			: readIdpMetadata(d.metadataXml ?? "", now);
		if (!m.ok) return { ok: false, error: m.error };
		return {
			ok: true,
			data: {
				entityId: m.metadata.entityId,
				ssoUrl: m.metadata.ssoUrl,
				certificates: m.metadata.certificates.map(certView),
				warnings: m.metadata.warnings,
			},
		};
	}
	const cert = certificateInfo(d.certificate ?? "");
	if (!cert) return { ok: false, error: "sso_cert_invalid" };
	return {
		ok: true,
		data: {
			entityId: null,
			ssoUrl: null,
			certificates: [certView(cert)],
			warnings: certWarnings(cert, now),
		},
	};
}

function certView(c: CertInfo) {
	return {
		fingerprint: c.fingerprint,
		notAfter: c.notAfter,
		subject: c.subject,
		keyBits: c.keyBits,
	};
}

// Regeln (S1/S2): Gruppen → Rolle, Firmen-MFA, Erzwingen. Erzwingen nur mit
// verifizierter SSO-Domain — sonst sperrt sich die Org selbst aus.
async function saveSsoPolicyImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = ssoPolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const next = ssoPolicyOf(parsed.data);
	if (
		next.enforce &&
		!(await listSsoProvidersForOrg(c.orgId)).some((p) => p.domainVerified)
	)
		return { ok: false, error: "sso_enforce_unverified" };
	// Vier-Augen (Härtung A4): Erzwingen an/aus, Firmen-MFA anerkennen und
	// Rollen aus Gruppen nur mit zweiter Person bzw. nach 24 h Wartezeit
	const [current] = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select({ ssoPolicy: orgSettings.ssoPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1),
	);
	const critical = ssoPolicyCritical(ssoPolicyOf(current?.ssoPolicy), next);
	if (critical.length > 0)
		return requestApplyChange(c, {
			kind: "sso_policy",
			targetKey: null,
			summary: ssoChangeSummary(critical),
			payload: { value: next, critical },
			before: current?.ssoPolicy ?? null,
		});
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ ssoPolicy: orgSettings.ssoPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ ssoPolicy: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "sso.policy_updated",
				target: `org:${c.orgId}`,
				before: ssoPolicyOf(row?.ssoPolicy),
				after: next,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// Verbindung testen: Discovery-Dokument des IdP abrufen (SSRF-geschützt).
async function testSsoDiscoveryImpl(
	input: unknown,
): Promise<ActionResult<{ issuer: string; endpoints: number }>> {
	const c = await requireOrg({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = discoveryTestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const r = await safeFetch(parsed.data.discoveryEndpoint, {
		budget: { requests: 3, deadline: Date.now() + 8_000 },
		maxBytes: 200_000,
	});
	if (!r.ok || r.res.status !== 200)
		return { ok: false, error: "sso_discovery_failed" };
	let doc: Record<string, unknown>;
	try {
		doc = JSON.parse(r.res.body) as Record<string, unknown>;
	} catch {
		return { ok: false, error: "sso_discovery_failed" };
	}
	const need = ["authorization_endpoint", "token_endpoint", "jwks_uri"];
	if (
		typeof doc.issuer !== "string" ||
		need.some((k) => typeof doc[k] !== "string")
	)
		return { ok: false, error: "sso_discovery_failed" };
	return { ok: true, data: { issuer: doc.issuer, endpoints: need.length } };
}

export const registerOidcPreset = safeAction(
	"registerOidcPreset",
	registerOidcPresetImpl,
);
export const registerSamlProvider = safeAction(
	"registerSamlProvider",
	registerSamlProviderImpl,
);
export const previewSamlMetadata = safeAction(
	"previewSamlMetadata",
	previewSamlMetadataImpl,
);
export const saveSsoPolicy = safeAction("saveSsoPolicy", saveSsoPolicyImpl);
export const testSsoDiscovery = safeAction(
	"testSsoDiscovery",
	testSsoDiscoveryImpl,
);

// Probe-Anmeldung (AP10b): eigene AuthnRequest, deren ID Klick sich merkt.
// Kommt die Antwort, halten die Hooks fest, was ankam, und brechen ab
// (lib/auth/sso-probe.ts) — kein Konto, keine Sitzung. Kein Step-up: es
// entsteht nichts.
async function startSsoProbeImpl(
	providerId: string,
): Promise<ActionResult<{ url: string }>> {
	const c = await requireOrg({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	const provider = (await listSsoProvidersForOrg(c.orgId)).find(
		(p) => p.providerId === parsed.data,
	);
	if (!provider || provider.protocol !== "saml")
		return { ok: false, error: "not_found" };
	if (!provider.domainVerified)
		return { ok: false, error: "sso_probe_unverified" };
	const probeId = crypto.randomUUID();
	const back = probePath(probeId);
	let url: string;
	try {
		const r = await auth.api.signInSSO({
			body: {
				providerId: parsed.data,
				callbackURL: back,
				errorCallbackURL: back,
			},
		});
		url = r.url;
	} catch (e) {
		return mapError(e);
	}
	const requestId = authnRequestId(url, inflateRawSync);
	if (!requestId) return { ok: false, error: "sso_probe_failed" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		// alte Proben dieser Org nach einem Tag weg (enthalten Personendaten)
		await tx
			.delete(ssoProbes)
			.where(
				and(
					eq(ssoProbes.organizationId, c.orgId),
					lt(ssoProbes.createdAt, new Date(Date.now() - 86_400_000)),
				),
			);
		await tx.insert(ssoProbes).values({
			id: probeId,
			organizationId: c.orgId,
			providerId: parsed.data,
			requestId,
			requestedBy: c.userId,
			expiresAt: new Date(Date.now() + PROBE_TTL_MS),
		});
		return {
			result: null,
			audit: {
				action: "sso.probe_started",
				target: `sso_provider:${parsed.data}`,
				after: { probeId },
			},
		};
	});
	return { ok: true, data: { url } };
}

export const startSsoProbe = safeAction("startSsoProbe", startSsoProbeImpl);
