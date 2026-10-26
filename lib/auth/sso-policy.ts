// SSO je Kunde (S1–S3) — rein, getestet. Anbieter-Vorlagen, Rolle aus
// Gruppen, Firmen-MFA aus den Claims, „SSO erzwingen“.

export const SSO_ROLES = ["employee", "viewer", "editor"] as const;
export type SsoRole = (typeof SSO_ROLES)[number];

const RANK: Record<SsoRole, number> = { employee: 0, viewer: 1, editor: 2 };

export type SsoGroupRole = { group: string; role: SsoRole };

export type SsoPolicy = {
	// Anmeldung für Konten der verifizierten Domains nur über SSO
	enforce: boolean;
	// Firmen-MFA (amr/AuthnContext) zählt als zweiter Faktor
	trustIdpMfa: boolean;
	// Rolle neuer SSO-Konten ohne passende Gruppe
	defaultRole: SsoRole;
	groupRoles: SsoGroupRole[];
	// Claim bzw. SAML-Attribut mit den Gruppen
	groupClaim: string;
};

export const DEFAULT_SSO_POLICY: SsoPolicy = {
	enforce: false,
	trustIdpMfa: false,
	defaultRole: "employee",
	groupRoles: [],
	groupClaim: "groups",
};

export function ssoPolicyOf(raw: unknown): SsoPolicy {
	const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SsoPolicy>;
	const role = (v: unknown): SsoRole | null =>
		SSO_ROLES.includes(v as SsoRole) ? (v as SsoRole) : null;
	return {
		enforce: r.enforce === true,
		trustIdpMfa: r.trustIdpMfa === true,
		defaultRole: role(r.defaultRole) ?? DEFAULT_SSO_POLICY.defaultRole,
		groupRoles: Array.isArray(r.groupRoles)
			? r.groupRoles.flatMap((g) => {
					const rr = role(g?.role);
					const group = typeof g?.group === "string" ? g.group.trim() : "";
					return rr && group ? [{ group, role: rr }] : [];
				})
			: [],
		groupClaim:
			typeof r.groupClaim === "string" && r.groupClaim.trim()
				? r.groupClaim.trim()
				: DEFAULT_SSO_POLICY.groupClaim,
	};
}

// Gruppen aus Claims/Attributen: Liste, kommagetrennter Text oder ein Wert.
export function groupsFrom(
	claims: Record<string, unknown> | null | undefined,
	claim: string,
): string[] {
	const v = claims?.[claim];
	const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
	return list
		.filter((x): x is string => typeof x === "string")
		.map((x) => x.trim())
		.filter(Boolean);
}

// Höchste passende Rolle; nie Inhaber:in. Ohne Treffer die Standardrolle.
// Gruppen-IDs (Entra) und Namen vergleichen ohne Groß-/Kleinschreibung.
export function roleFromGroups(groups: readonly string[], policy: SsoPolicy) {
	const have = new Set(groups.map((g) => g.toLowerCase()));
	let best: SsoRole | null = null;
	for (const m of policy.groupRoles)
		if (have.has(m.group.toLowerCase()) && (!best || RANK[m.role] > RANK[best]))
			best = m.role;
	return best ?? policy.defaultRole;
}

// Firmen-MFA: OIDC `amr` (RFC 8176) oder `acr` mit Mehr-Faktor-Wert.
const AMR_MFA = new Set([
	"mfa",
	"otp",
	"hwk",
	"swk",
	"sms",
	"fpt",
	"face",
	"sc",
]);
const ACR_MFA = [
	"http://schemas.openid.net/pape/policies/2007/06/multi-factor",
	"phr",
	"phrh",
];

export function oidcMfa(claims: Record<string, unknown> | null | undefined) {
	const amr = claims?.amr;
	if (
		Array.isArray(amr) &&
		amr.some((a) => typeof a === "string" && AMR_MFA.has(a.toLowerCase()))
	)
		return true;
	const acr = claims?.acr;
	return typeof acr === "string" && ACR_MFA.includes(acr);
}

// SAML: Entra/ADFS melden die Methoden im Attribut authnmethodsreferences
// (…/claims/multipleauthn); andere IdPs per AuthnContextClassRef-Attribut.
const SAML_MFA = [
	"http://schemas.microsoft.com/claims/multipleauthn",
	"urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract",
	"urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken",
	"https://refeds.org/profile/mfa",
];

export function samlMfa(
	attributes: Record<string, unknown> | null | undefined,
): boolean {
	for (const [k, v] of Object.entries(attributes ?? {})) {
		if (!/authnmethodsreferences|authncontextclassref/i.test(k)) continue;
		const vals = Array.isArray(v) ? v : [v];
		if (vals.some((x) => typeof x === "string" && SAML_MFA.includes(x)))
			return true;
	}
	return false;
}

// Rückruf des IdP (OIDC bzw. SAML-ACS) — nur dort entsteht eine SSO-Sitzung.
export function isSsoCallbackPath(path: string | null | undefined): boolean {
	return Boolean(
		path &&
			(path.startsWith("/sso/callback") ||
				path.startsWith("/sso/saml2/sp/acs")),
	);
}

// „SSO erzwingen“: Konten einer verifizierten, erzwungenen Domain bekommen
// außerhalb des SSO-Rückrufs keine Sitzung — außer Inhaber:innen der Org
// (Notzugang, auditiert) und Impersonation durch den Plattform-Betrieb.
export function ssoGate(input: {
	path: string | null | undefined;
	enforcingOrgs: readonly { orgId: string; isOwner: boolean }[];
}): "allow" | "deny" | "bypass" {
	if (input.enforcingOrgs.length === 0) return "allow";
	if (isSsoCallbackPath(input.path)) return "allow";
	if (input.path?.startsWith("/admin/impersonate")) return "allow";
	return input.enforcingOrgs.every((o) => o.isOwner) ? "bypass" : "deny";
}

// Geführte Einrichtung: Issuer und Discovery je Anbieter.
export type SsoKind = "entra" | "google" | "okta" | "oidc";

export function providerPreset(
	kind: SsoKind,
	input: { tenant?: string; oktaDomain?: string; issuer?: string },
): { issuer: string; discoveryEndpoint: string } | null {
	const tenant = (input.tenant ?? "").trim();
	switch (kind) {
		case "entra":
			if (!/^[0-9a-f-]{36}$|^[a-z0-9-]+\.onmicrosoft\.com$/i.test(tenant))
				return null;
			return withDiscovery(`https://login.microsoftonline.com/${tenant}/v2.0`);
		case "google":
			return withDiscovery("https://accounts.google.com");
		case "okta": {
			const d = (input.oktaDomain ?? "")
				.trim()
				.replace(/^https?:\/\//, "")
				.replace(/\/.*$/, "");
			if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d)) return null;
			return withDiscovery(`https://${d}`);
		}
		case "oidc": {
			const i = (input.issuer ?? "").trim().replace(/\/+$/, "");
			if (!/^https:\/\/[^\s/]+/.test(i)) return null;
			return withDiscovery(i);
		}
	}
}

const withDiscovery = (issuer: string) => ({
	issuer,
	discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
});
