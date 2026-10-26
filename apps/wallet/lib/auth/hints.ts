// Hinweise an die Anmeldeseite (pure, auch im Client): das Passkey-Plugin
// meldet Fehler aus Hooks nur als AUTHENTICATION_FAILED (zwei Kopien von
// @better-auth/core, CLAUDE.md) — der Grund kommt deshalb als kurzlebiges
// Cookie, das die Anmeldeseite einmal liest und löscht.

// Org verlangt Sicherheitsschlüssel, angemeldet wurde mit einem
// synchronisierten Passkey (Härtung W)
export const SECURITY_KEY_HINT_COOKIE = "both_security_key";
