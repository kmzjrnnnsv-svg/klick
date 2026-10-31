import { readFileSync } from "node:fs";
import { env } from "@/lib/env";

// Konfiguration der Teams-App von Klick (T5). Ohne Client-ID und Zugang
// (Zertifikat oder Geheimnis) ist Teams aus: Einstellungen zeigen das, der
// Job stellt nichts zu, Mails laufen wie bisher.

export type TeamsCredential =
	| { kind: "certificate"; pem: string }
	| { kind: "secret"; secret: string };

export type TeamsConfig = {
	clientId: string;
	appId: string;
	credential: TeamsCredential;
};

export function teamsConfig(): TeamsConfig | null {
	const e = env();
	if (!e.TEAMS_CLIENT_ID) return null;
	if (e.TEAMS_CERT_FILE) {
		try {
			const pem = readFileSync(e.TEAMS_CERT_FILE, "utf8");
			return {
				clientId: e.TEAMS_CLIENT_ID,
				appId: e.TEAMS_APP_ID,
				credential: { kind: "certificate", pem },
			};
		} catch {
			return null;
		}
	}
	if (e.TEAMS_CLIENT_SECRET)
		return {
			clientId: e.TEAMS_CLIENT_ID,
			appId: e.TEAMS_APP_ID,
			credential: { kind: "secret", secret: e.TEAMS_CLIENT_SECRET },
		};
	return null;
}

export function teamsConfigured(): boolean {
	const e = env();
	return Boolean(
		e.TEAMS_CLIENT_ID && (e.TEAMS_CERT_FILE || e.TEAMS_CLIENT_SECRET),
	);
}
