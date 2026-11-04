import { readFileSync } from "node:fs";
import { env } from "@/lib/env";
import type { MsAppConfig } from "@/lib/microsoft/token";

// App-Registrierung „Klick Identität“ (Teil D): eigene Client-ID neben
// Teams, nur Leserechte. Ohne Client-ID und Zugang (Zertifikat oder
// Geheimnis) ist Entra ID aus; Google und Okta brauchen das nicht.

export function identityMsConfig(): MsAppConfig | null {
	const e = env();
	if (!e.IDENTITY_MS_CLIENT_ID) return null;
	if (e.IDENTITY_MS_CERT_FILE) {
		try {
			const pem = readFileSync(e.IDENTITY_MS_CERT_FILE, "utf8");
			return {
				clientId: e.IDENTITY_MS_CLIENT_ID,
				credential: { kind: "certificate", pem },
			};
		} catch {
			return null;
		}
	}
	if (e.IDENTITY_MS_CLIENT_SECRET)
		return {
			clientId: e.IDENTITY_MS_CLIENT_ID,
			credential: { kind: "secret", secret: e.IDENTITY_MS_CLIENT_SECRET },
		};
	return null;
}

export function entraConfigured(): boolean {
	const e = env();
	return Boolean(
		e.IDENTITY_MS_CLIENT_ID &&
			(e.IDENTITY_MS_CERT_FILE || e.IDENTITY_MS_CLIENT_SECRET),
	);
}
