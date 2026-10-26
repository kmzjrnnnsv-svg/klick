"use server";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { listSsoProvidersForOrg } from "@/lib/auth/org";
import { auth } from "@/lib/auth/server";
import { AuthError } from "@/lib/auth/session-rules";
import { providerPreset, ssoPolicyOf } from "@/lib/auth/sso-policy";
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
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.provider_deleted",
			target: `sso_provider:${parsed.data}`,
		},
	}));
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

// SAML 2.0 (S3): Metadaten des IdP oder Entity-ID + SSO-URL + Zertifikat;
// Klicks SP-Metadaten unter /api/auth/sso/saml2/sp/metadata?providerId=…
async function registerSamlProviderImpl(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = registerSamlSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const base = new URL(env().BETTER_AUTH_URL).origin;
	const spEntityId = `${base}/api/auth/sso/saml2/sp/metadata?providerId=${d.providerId}`;
	const idpEntityId = d.entityId ?? entityIdFromMetadata(d.metadataXml) ?? "";
	if (!idpEntityId) return { ok: false, error: "sso_saml_entity" };
	try {
		await auth.api.registerSSOProvider({
			body: {
				providerId: d.providerId,
				issuer: idpEntityId,
				domain: d.domain,
				organizationId: c.orgId,
				samlConfig: {
					issuer: spEntityId,
					entryPoint: d.ssoUrl ?? "",
					cert: d.metadataXml ? undefined : d.certificate,
					callbackUrl: `${base}/heute`,
					idpMetadata: d.metadataXml
						? { metadata: d.metadataXml }
						: { entityID: idpEntityId, cert: d.certificate },
					wantAssertionsSigned: true,
					mapping: {
						email: d.emailAttribute || "email",
						name: d.nameAttribute || "name",
						extraFields: {
							groups:
								d.groupsAttribute ||
								"http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
							authnmethodsreferences:
								"http://schemas.microsoft.com/claims/authnmethodsreferences",
						},
					},
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
			after: { domain: d.domain, protocol: "saml", issuer: idpEntityId },
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

function entityIdFromMetadata(xml: string | undefined): string | null {
	return /entityID="([^"]{1,500})"/.exec(xml ?? "")?.[1] ?? null;
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
export const saveSsoPolicy = safeAction("saveSsoPolicy", saveSsoPolicyImpl);
export const testSsoDiscovery = safeAction(
	"testSsoDiscovery",
	testSsoDiscoveryImpl,
);
