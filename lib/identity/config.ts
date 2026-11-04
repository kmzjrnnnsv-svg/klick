import { readFileSync } from "node:fs";
import { env } from "@/lib/env";
import {
	type GoogleServiceAccount,
	parseServiceAccount,
} from "@/lib/google/token";
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

// Dienstkonto „Klick Identität“ für Google Workspace (Teil D I3): ein
// Schlüssel für alle Kundinnen, jede gibt ihn in ihrer domänenweiten
// Delegierung frei. Gelesen je Aufruf (Credential-Datei, kein Zwischenspeicher
// mit dem Schlüssel über die Anfrage hinaus).
export function identityGoogleAccount(): GoogleServiceAccount | null {
	const file = env().IDENTITY_GOOGLE_SA_FILE;
	if (!file) return null;
	try {
		return parseServiceAccount(readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

// Client-ID für die Anzeige (keine Geheimnisse)
export function googleClientId(): string | null {
	return identityGoogleAccount()?.clientId ?? null;
}
