// Kontostatus für Admin → Benutzer, Mail-Notweg und Passkey-Links — pure.
// „Nicht aktiviert“ = angelegt von einem Plattform-Admin, Aktivierungslink
// noch nicht eingelöst (Zeile passkey-activate:… in verification).

export type AccountStatus = "active" | "pending" | "blocked";

// Kurzer Hinweis-Cookie nach einer Passkey-Anmeldung eines gesperrten
// Kontos (server.ts, authentication.afterVerification): Das Passkey-Plugin
// meldet jeden Fehler dort nur als AUTHENTICATION_FAILED; /login zeigt
// damit „gesperrt“. Erfährt nur, wer den Passkey hält.
export const BLOCKED_HINT_COOKIE = "klick_blocked";
// SSO erzwungen: /login zeigt „Bitte mit dem Firmenkonto anmelden“
export const SSO_HINT_COOKIE = "klick_sso";

export type AccountFacts = {
	banned: boolean | null;
	banExpires: Date | null;
	pendingActivation: boolean;
};

// Better Auth hebt abgelaufene Sperren erst beim nächsten Anmelden auf —
// bis dahin steht banned noch auf true.
export function isBanActive(
	u: { banned?: boolean | null; banExpires?: Date | null },
	now = new Date(),
): boolean {
	if (!u.banned) return false;
	return !u.banExpires || u.banExpires.getTime() > now.getTime();
}

export function accountStatus(
	u: AccountFacts,
	now = new Date(),
): AccountStatus {
	if (isBanActive(u, now)) return "blocked";
	if (u.pendingActivation) return "pending";
	return "active";
}

// Mail-Notweg (Allow-List): bestehende Konten nur aktiv — angelegte Konten
// kommen nur über den Passkey-Link hinein, gesperrte gar nicht. Ohne Konto
// nur mit offener Einladung.
export function magicLinkAllowed(
	input: { account: AccountFacts | null; openInvitation: boolean },
	now = new Date(),
): boolean {
	if (input.account) return accountStatus(input.account, now) === "active";
	return input.openInvitation;
}
