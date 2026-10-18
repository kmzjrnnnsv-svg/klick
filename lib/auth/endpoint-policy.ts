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

// E-Mail-/SMS-Codes als zweiter Faktor sind nicht eingerichtet.
const NEVER = new Set(["/two-factor/send-otp", "/two-factor/verify-otp"]);

export const GUARDED_AUTH_PATHS: ReadonlySet<string> = new Set([
	...FACTOR_MANAGEMENT,
	...FACTOR_ENROL,
	...NEVER,
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
