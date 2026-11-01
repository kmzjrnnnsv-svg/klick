import { isPublicHttpsUrl } from "@/lib/net/public-url";

// SAML in fünf Minuten (AP10) — rein, ohne Server-Importe (auch im Browser).
// Vorlagen je Anbieter: Attributnamen, woher die Metadaten kommen, welche
// Hosts sie liefern dürfen. Die Schritte mit den Namen aus der Oberfläche
// des Anbieters stehen in messages/de.json (SsoSetup.samlSteps_<anbieter>).
// Namen und Pfade nach Herstellerdoku Stand Oktober 2026, prüfen.

export const SAML_VENDORS = [
	"entra",
	"google",
	"okta",
	"adfs",
	"jumpcloud",
	"onelogin",
	"other",
] as const;
export type SamlVendor = (typeof SAML_VENDORS)[number];

export type SamlVendorPreset = {
	// Woher die Metadaten des Anbieters kommen: Adresse, Datei oder beides
	metadata: "url" | "file" | "both";
	// Hosts, von denen Klick die Metadaten holen darf (Suffix mit Punkt =
	// Subdomain, sonst genau dieser Host)
	metadataHosts: readonly string[];
	// Metadaten dürfen auch von der eigenen Domain der Org kommen (ADFS)
	ownDomain: boolean;
	// Beispiel der Metadaten-Adresse (nur Anzeige)
	metadataUrlExample: string | null;
	attributes: { email: string; name: string; groups: string | null };
	// Liefert der Anbieter Gruppen bzw. eine Angabe zur Mehr-Faktor-Anmeldung?
	groups: boolean;
	mfa: boolean;
};

const CLAIMS = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims";

export const SAML_PRESETS: Record<SamlVendor, SamlVendorPreset> = {
	entra: {
		metadata: "both",
		metadataHosts: ["login.microsoftonline.com"],
		ownDomain: false,
		metadataUrlExample:
			"https://login.microsoftonline.com/<tenant>/federationmetadata/2007-06/federationmetadata.xml?appid=<app-id>",
		attributes: {
			email: `${CLAIMS}/emailaddress`,
			name: "http://schemas.microsoft.com/identity/claims/displayname",
			groups: "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
		},
		groups: true,
		mfa: true,
	},
	google: {
		// Google bietet die Metadaten nur als Download an
		metadata: "file",
		metadataHosts: [],
		ownDomain: false,
		metadataUrlExample: null,
		attributes: { email: "email", name: "name", groups: "groups" },
		groups: true,
		mfa: false,
	},
	okta: {
		metadata: "both",
		metadataHosts: [".okta.com", ".oktapreview.com", ".okta-emea.com"],
		ownDomain: false,
		metadataUrlExample: "https://firma.okta.com/app/<app-id>/sso/saml/metadata",
		attributes: { email: "email", name: "name", groups: "groups" },
		groups: true,
		mfa: false,
	},
	adfs: {
		metadata: "both",
		metadataHosts: [],
		ownDomain: true,
		metadataUrlExample:
			"https://adfs.firma.de/FederationMetadata/2007-06/FederationMetadata.xml",
		attributes: {
			email: `${CLAIMS}/emailaddress`,
			name: `${CLAIMS}/name`,
			groups: "http://schemas.xmlsoap.org/claims/Group",
		},
		groups: true,
		mfa: true,
	},
	jumpcloud: {
		metadata: "file",
		metadataHosts: ["sso.jumpcloud.com"],
		ownDomain: false,
		metadataUrlExample: null,
		attributes: { email: "email", name: "name", groups: "memberOf" },
		groups: true,
		mfa: false,
	},
	onelogin: {
		metadata: "both",
		metadataHosts: [".onelogin.com"],
		ownDomain: false,
		metadataUrlExample: "https://firma.onelogin.com/saml/metadata/<app-id>",
		attributes: { email: "email", name: "name", groups: "groups" },
		groups: true,
		mfa: false,
	},
	other: {
		metadata: "both",
		// bekannte Cloud-Anbieter (Ping, Auth0) dazu die eigene Domain
		metadataHosts: [
			".pingone.com",
			".pingone.eu",
			".pingidentity.com",
			".auth0.com",
		],
		ownDomain: true,
		metadataUrlExample: null,
		attributes: { email: "email", name: "name", groups: "groups" },
		groups: true,
		mfa: false,
	},
};

export function isSamlVendor(v: unknown): v is SamlVendor {
	return SAML_VENDORS.includes(v as SamlVendor);
}

/** Kennung aus der Domain: „firma.de“ → „saml-firma-de“ (Regel in
 *  ssoProviderIdSchema: 3–40 Zeichen, Kleinbuchstaben, Ziffern, Bindestrich). */
export function suggestProviderId(
	domain: string,
	protocol: "saml" | "oidc" = "saml",
): string {
	const first = domain.split(",")[0] ?? "";
	const slug = first
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const id = `${protocol}-${slug || "firma"}`.slice(0, 40).replace(/-+$/, "");
	return id.length >= 3 ? id : `${protocol}-sso`;
}

function hostAllowed(host: string, rule: string): boolean {
	return rule.startsWith(".")
		? host.endsWith(rule) && host.length > rule.length
		: host === rule;
}

/**
 * Darf Klick die Metadaten von dieser Adresse holen? Nur https auf einen
 * öffentlichen Host, nur von den Hosts des Anbieters bzw. (ADFS, andere)
 * von der eigenen Domain der Org oder einer Subdomain davon. Den Abruf
 * selbst macht safeFetch (angeheftete öffentliche IP, keine Weiterleitung
 * ins interne Netz).
 */
export function metadataUrlAllowed(
	url: string,
	vendor: SamlVendor,
	orgDomains: readonly string[],
): boolean {
	if (!isPublicHttpsUrl(url)) return false;
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (u.username || u.password) return false;
	if (u.port && u.port !== "443") return false;
	const host = u.hostname.toLowerCase();
	const preset = SAML_PRESETS[vendor];
	if (preset.metadataHosts.some((r) => hostAllowed(host, r))) return true;
	if (!preset.ownDomain) return false;
	return orgDomains
		.flatMap((d) => d.split(","))
		.map((d) => d.trim().toLowerCase())
		.filter((d) => d.length > 0)
		.some((d) => host === d || host.endsWith(`.${d}`));
}

const xmlEscape = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Metadaten von Klick als Datei (zum Hochladen beim Anbieter), dieselben
 *  Werte wie /api/auth/sso/saml2/sp/metadata nach der Einrichtung. */
export function spMetadataXml(input: {
	entityId: string;
	acsUrl: string;
}): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${xmlEscape(input.entityId)}">`,
		'  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">',
		"    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>",
		`    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${xmlEscape(input.acsUrl)}" index="0" isDefault="true"/>`,
		"  </md:SPSSODescriptor>",
		"</md:EntityDescriptor>",
		"",
	].join("\n");
}

const DAY = 86_400_000;

/** Erinnerung zum Zertifikat: abgelaufen, in 7 bzw. 30 Tagen, sonst keine. */
export function certReminder(
	notAfter: Date | string | null | undefined,
	now: Date,
): "expired" | "7" | "30" | null {
	if (!notAfter) return null;
	const end = new Date(notAfter).getTime();
	if (Number.isNaN(end)) return null;
	const left = end - now.getTime();
	if (left <= 0) return "expired";
	if (left <= 7 * DAY) return "7";
	if (left <= 30 * DAY) return "30";
	return null;
}

/** Tage bis zum Ablauf (abgerundet, nie negativ) für die Anzeige. */
export function daysLeft(notAfter: Date | string, now: Date): number {
	return Math.max(
		0,
		Math.floor((new Date(notAfter).getTime() - now.getTime()) / DAY),
	);
}

// Stand je Anbieter: eingerichtet · Domain bestätigt · Probe · erzwungen.
// Der nächste Schritt ist genau ein Knopf.
export type SsoStep = "domain" | "probe" | "enforce" | "done";

export function nextSsoStep(input: {
	domainVerified: boolean;
	probeOk: boolean;
	protocol: "saml" | "oidc";
	enforced: boolean;
}): SsoStep {
	if (!input.domainVerified) return "domain";
	if (input.protocol === "saml" && !input.probeOk) return "probe";
	if (!input.enforced) return "enforce";
	return "done";
}
