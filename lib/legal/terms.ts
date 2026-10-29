// Fassung der Nutzungsbedingungen (CMS-Seite `nutzungsbedingungen`,
// Vorlage docs/legal/nutzungsbedingungen.md). Bei jeder inhaltlichen
// Änderung hochzählen — die Einrichtung speichert, welche Fassung beim
// Anlegen der Organisation bestätigt wurde (org_settings.setupFlags).
export const TERMS_VERSION = "2026-10";

export const TERMS_FLAG = {
	acceptedAt: "termsAcceptedAt",
	version: "termsVersion",
} as const;

// Bestätigt, wenn beim Anlegen (Onboarding) oder beim ersten Einstieg einer
// Inhaber:in (/zustimmung, Organisation vom Plattform-Admin angelegt) die
// Bestätigung gespeichert wurde.
export function termsAccepted(
	flags: Readonly<Record<string, string>>,
): boolean {
	return Boolean(flags[TERMS_FLAG.acceptedAt]);
}
