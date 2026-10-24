// Adressen und Relying Party von both.money — eine Quelle für Server,
// Passkey-Bestätigung und Links. Ohne Env-Validierung beim Import, damit
// Skripte und Build die Datei laden können.
export const baseURL = process.env.WALLET_AUTH_URL ?? "http://localhost:3400";
// Nie ändern, sobald Passkeys existieren (bricht alle Passkeys)
export const rpID =
	process.env.WALLET_PASSKEY_RP_ID ?? new URL(baseURL).hostname;
export const rpName = "both.money";
export const isProd = process.env.NODE_ENV === "production";
