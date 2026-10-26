// Regeln für Better-Auth-Endpunkte, die Faktoren verwalten — pure, getestet
// (tests/endpoint-policy.test.ts). Der Guard (requireOrg & Co.) läuft nicht
// auf /api/auth/*; ohne diese Regeln konnte eine Sitzung, die nur per
// Mail-Link angemeldet ist, das TOTP-Geheimnis abrufen, Backup-Codes
// erzeugen, 2FA abschalten oder einen eigenen Passkey registrieren — und
// damit den zweiten Faktor umgehen. Durchgesetzt in lib/auth/endpoint-guard.ts
// (hooks.before).

export type EndpointState = {
	hasSession: boolean;
	// zweiter Faktor in dieser Sitzung bestätigt (session.mfaVerifiedAt)
	mfaVerified: boolean;
	// Step-up frisch (≤ 10 min, isStepUpFresh)
	stepUpFresh: boolean;
	hasTotp: boolean;
	// Anzahl eigener Passkeys (0 = keiner)
	passkeys: number;
	// Passkey-Registrierung ohne Sitzung über einen Einladungs- bzw.
	// Zurücksetz-Link (Cookie aus /api/registrierung); den Token selbst prüft
	// registration.resolveUser
	hasRegistrationToken: boolean;
	// Anfrage kommt aus dem Admin-Netz (WireGuard, ADMIN_NETWORKS) oder ist
	// ein Aufruf aus dem Server selbst (auth.api ohne HTTP-Anfrage)
	adminNetwork: boolean;
	// Sitzung „als Person angemeldet“ (Admin-Plugin, Lockbox): nie Faktoren,
	// Org-Wechsel oder Beitritte im Namen der Person
	impersonated: boolean;
	// Aufruf kommt per HTTP (nicht auth.api aus einer Server-Action)
	httpRequest: boolean;
};

export type EndpointDecision =
	| { allow: true }
	| {
			allow: false;
			code:
				| "unauthenticated"
				| "mfa_required"
				| "step_up_required"
				| "last_factor"
				| "admin_network"
				| "forbidden";
	  };

// Faktoren verwalten: nur mit bestätigtem zweitem Faktor und frischem Step-up.
const FACTOR_MANAGEMENT = new Set([
	"/two-factor/get-totp-uri",
	"/two-factor/generate-backup-codes",
	"/two-factor/disable",
	"/passkey/delete-passkey",
	"/passkey/update-passkey",
]);

// Faktor entfernen: nie den letzten (sonst wäre das Konto ohne zweiten
// Faktor bzw. ausgesperrt — dafür gibt es „Zugang zurücksetzen“).
const FACTOR_REMOVAL = new Set([
	"/two-factor/disable",
	"/passkey/delete-passkey",
]);

// Faktor hinzufügen: die Ersteinrichtung (noch kein Faktor) ist frei, jeder
// weitere Faktor verlangt MFA + Step-up.
const FACTOR_ENROL = new Set([
	"/two-factor/enable",
	"/passkey/generate-register-options",
	"/passkey/verify-registration",
]);

// Admin-Plugin (Konten anlegen, Rollen, Sperren, Impersonation): nur aus dem
// Admin-Netz (Härtung A2); nginx sperrt den Pfad zusätzlich.
export const ADMIN_ENDPOINT_PREFIX = "/admin/";

export const IMPERSONATE_PATH = "/admin/impersonate-user";
export const STOP_IMPERSONATING_PATH = "/admin/stop-impersonating";

// Per HTTP nur „als Person anmelden“ und beenden. Konten anlegen, Rollen,
// Sperren und Sitzungen laufen über die Admin-Actions (Step-up, Lockbox,
// Audit); direkt per HTTP reichte sonst eine Admin-Sitzung aus dem Admin-Netz
// ohne zweiten Faktor (Selbstprüfung K1).
const ADMIN_HTTP_ALLOWED = new Set([IMPERSONATE_PATH, STOP_IMPERSONATING_PATH]);

// Org-Plugin per HTTP nur Einladung annehmen bzw. ablehnen. Lesen (Mitglieder,
// Einladungen, Org-Daten) und Wechseln laufen über Actions mit requireOrg —
// dort greifen IP-Liste der Org und Bindung der Lockbox, auf /api/auth nicht
// (Selbstprüfung K4).
const ORG_ENDPOINT_PREFIX = "/organization/";
const ORG_HTTP_ALLOWED = new Set([
	"/organization/accept-invitation",
	"/organization/reject-invitation",
]);

// In einer Impersonation-Sitzung per HTTP nur Sitzung lesen, abmelden und
// beenden: jeder andere Endpunkt wirkte im Namen der Person außerhalb von
// requireOrg (Lockbox, Härtung A3).
export const IMPERSONATION_HTTP_ALLOWED: ReadonlySet<string> = new Set([
	"/get-session",
	"/sign-out",
	STOP_IMPERSONATING_PATH,
]);

export function isGuardedAuthPath(path: string): boolean {
	return (
		GUARDED_AUTH_PATHS.has(path) ||
		path.startsWith(ADMIN_ENDPOINT_PREFIX) ||
		path.startsWith(ORG_ENDPOINT_PREFIX)
	);
}

/** Nur aus dem Server (auth.api), nie per HTTP. */
export function httpServerOnly(path: string): boolean {
	if (SERVER_ONLY.has(path)) return true;
	if (path.startsWith(ADMIN_ENDPOINT_PREFIX))
		return !ADMIN_HTTP_ALLOWED.has(path);
	if (path.startsWith(ORG_ENDPOINT_PREFIX)) return !ORG_HTTP_ALLOWED.has(path);
	return false;
}

// In einer Impersonation-Sitzung gesperrt (neben Faktoren und Admin):
// Org wechseln oder beitreten trüge den Zugriff aus der freigebenden Org
// heraus (Lockbox, Härtung A3).
const IMPERSONATION_BLOCKED = new Set([
	"/organization/set-active",
	"/organization/accept-invitation",
]);

// Nur aus Server-Actions (auth.api ohne HTTP-Anfrage): dort laufen Step-up,
// Vier-Augen (Härtung A4), Ein-Org-Regel und Audit. Direkt per HTTP würde
// eine Inhaber-Sitzung all das umgehen (Org löschen, Inhaber:in machen,
// SSO-Verbindung entfernen).
const SERVER_ONLY = new Set([
	"/organization/invite-member",
	"/organization/update-member-role",
	"/organization/remove-member",
	"/organization/cancel-invitation",
	"/organization/update",
	"/organization/delete",
	"/sso/register",
	"/sso/update-provider",
	"/sso/delete-provider",
	"/sso/request-domain-verification",
	"/sso/verify-domain",
]);

// E-Mail-/SMS-Codes als zweiter Faktor sind nicht eingerichtet. Der geteilte
// SSO-Rückruf ohne Anbieter-ID (nur mit redirectURI) ist ungenutzt: Klick
// bindet jeden Rückruf an genau einen Anbieter und dessen Domain (A7).
const NEVER = new Set([
	"/two-factor/send-otp",
	"/two-factor/verify-otp",
	"/sso/callback",
]);

export const GUARDED_AUTH_PATHS: ReadonlySet<string> = new Set([
	...FACTOR_MANAGEMENT,
	...FACTOR_ENROL,
	...NEVER,
	...IMPERSONATION_BLOCKED,
	...SERVER_ONLY,
]);

const allow: EndpointDecision = { allow: true };
const deny = (
	code: Extract<EndpointDecision, { allow: false }>["code"],
): EndpointDecision => ({ allow: false, code });

export function authEndpointDecision(
	path: string,
	s: EndpointState,
): EndpointDecision {
	if (NEVER.has(path)) return deny("forbidden");
	if (s.httpRequest && httpServerOnly(path)) return deny("forbidden");
	if (s.impersonated) {
		if (s.httpRequest && !IMPERSONATION_HTTP_ALLOWED.has(path))
			return deny("forbidden");
		if (
			IMPERSONATION_BLOCKED.has(path) ||
			FACTOR_MANAGEMENT.has(path) ||
			FACTOR_ENROL.has(path) ||
			(path.startsWith(ADMIN_ENDPOINT_PREFIX) &&
				path !== STOP_IMPERSONATING_PATH)
		)
			return deny("forbidden");
	}
	if (path.startsWith(ADMIN_ENDPOINT_PREFIX) && !s.adminNetwork)
		return deny("admin_network");
	// Als Person anmelden (Lockbox, Härtung A3): frisch bestätigte Admin-
	// Sitzung; ob die Org freigegeben hat, prüft session.create.before
	if (path === IMPERSONATE_PATH) {
		if (!s.hasSession) return deny("unauthenticated");
		if (!s.mfaVerified) return deny("mfa_required");
		if (!s.stepUpFresh) return deny("step_up_required");
	}
	const factors = (s.hasTotp ? 1 : 0) + s.passkeys;
	const hasFactor = factors > 0;
	const verified = (): EndpointDecision =>
		!s.mfaVerified
			? deny("mfa_required")
			: !s.stepUpFresh
				? deny("step_up_required")
				: allow;

	if (FACTOR_MANAGEMENT.has(path)) {
		if (!s.hasSession) return deny("unauthenticated");
		const v = verified();
		if (v.allow && FACTOR_REMOVAL.has(path) && factors <= 1)
			return deny("last_factor");
		return v;
	}
	if (FACTOR_ENROL.has(path)) {
		if (!s.hasSession) {
			// Passkey ohne Sitzung nur über einen Link-Token. Die Bestätigung
			// (verify-registration) ist an die Challenge aus dem ersten Schritt
			// gebunden, die nur mit gültigem Token ausgestellt wurde.
			if (path === "/passkey/generate-register-options")
				return s.hasRegistrationToken ? allow : deny("unauthenticated");
			if (path === "/passkey/verify-registration") return allow;
			return deny("unauthenticated");
		}
		if (!hasFactor) return allow;
		return verified();
	}
	return allow;
}
