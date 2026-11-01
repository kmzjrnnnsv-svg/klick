import { z } from "zod";
import { isPublicHttpsUrl } from "@/lib/net/public-url";

export { isPublicHttpsUrl } from "@/lib/net/public-url";

// SSO je Organisation (OIDC). Lebt außerhalb der "use server"-Datei, weil
// Server-Action-Module nur async Funktionen exportieren dürfen.

const publicHttpsUrl = z
	.url()
	.refine(isPublicHttpsUrl, { message: "Nur https auf öffentliche Hosts" });

export const ssoProviderIdSchema = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "Kleinbuchstaben, Ziffern, Bindestrich");

export const registerSsoSchema = z.object({
	providerId: ssoProviderIdSchema,
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "z. B. firma.de"),
	issuer: publicHttpsUrl,
	clientId: z.string().trim().min(1).max(200),
	clientSecret: z.string().min(1).max(500),
	discoveryEndpoint: publicHttpsUrl
		.optional()
		.or(z.literal("").transform(() => undefined)),
	scopes: z.string().trim().max(200).optional(),
});

export type RegisterSsoInput = z.infer<typeof registerSsoSchema>;

// Geführte Einrichtung (S1): Anbieter wählen, Klick setzt Issuer/Discovery.
const domainField = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "z. B. firma.de");

export const registerOidcPresetSchema = z.object({
	kind: z.enum(["entra", "google", "okta", "oidc"]),
	providerId: ssoProviderIdSchema,
	domain: domainField,
	tenant: z.string().trim().max(120).optional(),
	oktaDomain: z.string().trim().max(200).optional(),
	issuer: z.string().trim().max(300).optional(),
	clientId: z.string().trim().min(1).max(200),
	clientSecret: z.string().min(1).max(500),
});

// SAML 2.0 (S3, AP10): Anbieter-Vorlage; Metadaten als Adresse (Klick holt
// sie, nur Hosts des Anbieters), als XML oder Entity-ID + SSO-URL +
// Zertifikat. Liste = SAML_VENDORS (lib/auth/sso-saml-vendors.ts, Test
// sso-saml-setup) — hier wiederholt, weil jene Datei diese importiert.
export const samlVendorSchema = z.enum([
	"entra",
	"google",
	"okta",
	"adfs",
	"jumpcloud",
	"onelogin",
	"other",
]);

const optionalHttps = publicHttpsUrl
	.optional()
	.or(z.literal("").transform(() => undefined));

export const registerSamlSchema = z
	.object({
		vendor: samlVendorSchema.default("other"),
		providerId: ssoProviderIdSchema,
		domain: domainField,
		metadataUrl: optionalHttps,
		metadataXml: z.string().trim().max(200_000).optional(),
		entityId: z.string().trim().max(500).optional(),
		ssoUrl: optionalHttps,
		certificate: z.string().trim().max(20_000).optional(),
		emailAttribute: z.string().trim().max(200).optional(),
		nameAttribute: z.string().trim().max(200).optional(),
		groupsAttribute: z.string().trim().max(200).optional(),
	})
	.refine(
		(d) =>
			Boolean(d.metadataUrl) ||
			Boolean(d.metadataXml?.includes("EntityDescriptor")) ||
			Boolean(
				d.entityId && d.ssoUrl && d.certificate?.includes("BEGIN CERTIFICATE"),
			),
		{ message: "saml_incomplete", path: ["metadataXml"] },
	);

// Einrichtungslink für die IT (AP10d)
export const setupLinkSchema = z.object({
	vendor: samlVendorSchema,
	domain: domainField,
});

// Vorschau vor dem Anlegen: Metadaten lesen, Zertifikat und Ablauf zeigen
export const samlPreviewSchema = z
	.object({
		vendor: samlVendorSchema,
		domain: domainField,
		metadataUrl: optionalHttps,
		metadataXml: z.string().trim().max(200_000).optional(),
		certificate: z.string().trim().max(20_000).optional(),
	})
	.refine((d) => d.metadataUrl || d.metadataXml || d.certificate, {
		message: "saml_incomplete",
		path: ["metadataXml"],
	});

export const ssoPolicySchema = z.object({
	enforce: z.boolean(),
	trustIdpMfa: z.boolean(),
	defaultRole: z.enum(["employee", "viewer", "editor"]),
	groupClaim: z.string().trim().min(1).max(200),
	groupRoles: z
		.array(
			z.object({
				group: z.string().trim().min(1).max(200),
				role: z.enum(["employee", "viewer", "editor"]),
			}),
		)
		.max(50),
});

export const discoveryTestSchema = z.object({
	discoveryEndpoint: publicHttpsUrl,
});
