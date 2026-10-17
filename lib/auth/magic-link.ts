// Reine Helfer für den Magic-Link-Flow (ohne Next-/DB-Importe, damit sie
// unit-testbar sind). Verwendet von lib/auth/server.ts und den Login-Seiten.

export const MAGIC_LINK_PARAMS = [
	"token",
	"callbackURL",
	"newUserCallbackURL",
	"errorCallbackURL",
] as const;

// Better Auth erzeugt 32 Zeichen [a-zA-Z]; großzügig, aber ohne Sonderzeichen.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

// Weiterleitungsziel nach dem Login (?weiter=…): nur Seiten auf dem eigenen
// Origin — nie "//host", "/\host", Steuerzeichen oder API-Routen. Nimmt
// unknown: Query-Parameter kommen bei Wiederholung als Array an.
export function safeNextPath(raw: unknown): string | null {
	if (typeof raw !== "string" || !raw || raw.length > 512) return null;
	if (!raw.startsWith("/") || raw.startsWith("//")) return null;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen gezielt ablehnen
	if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
	if (raw === "/api" || raw.startsWith("/api/")) return null;
	try {
		const probe = new URL(raw, "http://klick.invalid");
		if (probe.origin !== "http://klick.invalid") return null;
	} catch {
		return null;
	}
	return raw;
}

// Link in der Mail → Bestätigungsseite statt Verify-Endpunkt. Link-Scanner
// (z. B. Microsoft Defender Safe Links) rufen URLs aus Mails vorab auf und
// würden den Einmal-Token verbrauchen; /login/link verifiziert erst nach Klick.
export function confirmLinkUrl(verifyUrl: string): string {
	const src = new URL(verifyUrl);
	const out = new URL("/login/link", src.origin);
	for (const key of MAGIC_LINK_PARAMS) {
		const value = src.searchParams.get(key);
		if (value) out.searchParams.set(key, value);
	}
	return out.toString();
}

// Felder für das Formular auf /login/link (GET an den Verify-Endpunkt).
// null, wenn der Token fehlt oder offensichtlich kaputt ist.
export function verifyFormFields(
	query: Record<string, string | string[] | undefined>,
): Array<[string, string]> | null {
	const first = (v: string | string[] | undefined) =>
		Array.isArray(v) ? v[0] : v;
	const token = first(query.token);
	if (!token || !TOKEN_RE.test(token)) return null;
	const fields: Array<[string, string]> = [["token", token]];
	for (const key of MAGIC_LINK_PARAMS) {
		if (key === "token") continue;
		const path = safeNextPath(first(query[key]));
		if (path) fields.push([key, path]);
	}
	return fields;
}

// Fehlercode, den Better Auth beim Klick auf den Link an errorCallbackURL
// hängt (?error=…), → Hinweis auf der Login-Seite.
export type LinkFailure = "expired" | "no_account" | "other";

export function linkFailure(error: string | null | undefined): LinkFailure {
	if (error === "INVALID_TOKEN") return "expired";
	if (error === "new_user_signup_disabled") return "no_account";
	return "other";
}
