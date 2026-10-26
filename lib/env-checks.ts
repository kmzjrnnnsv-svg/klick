// Start-Prüfung für Produktion (Härtung A6, Methode `insecure-defaults`):
// Was ohne Konfiguration unsicher wäre, lässt Klick in Produktion nicht
// starten — außer die Abweichung steht ausdrücklich in PROD_ACCEPT_RISKS.
// Pure, getestet (tests/env-checks.test.ts); aufgerufen in instrumentation.ts.

import type { Env } from "./env";

export const PROD_RISKS = {
	no_av:
		"Kein Virenscanner (CLAMD_HOST fehlt): Uploads laufen ohne Malware-Prüfung",
	admin_anywhere:
		"Kein Admin-Netz (ADMIN_NETWORKS fehlt): /admin und Plattform-Aktionen aus dem ganzen Internet",
	signup_open:
		"AUTH_ALLOW_SIGNUP=true: jede Adresse bekommt einen Anmelde-Link und darf eine Organisation anlegen",
	mail_us:
		"MAIL_ALLOW_RESEND=true: Mails dürfen über einen US-Anbieter (Resend) gehen",
	parser_in_app:
		"PARSER_SOCKET fehlt: fremde Dateien parst ein Kindprozess mit den Rechten der App",
} as const;

export type ProdRisk = keyof typeof PROD_RISKS;

export type ConfigReport = {
	/** verhindern den Start */
	fatal: string[];
	/** hingenommen oder nur Hinweis */
	warnings: string[];
};

type Input = Pick<
	Env,
	| "NODE_ENV"
	| "BETTER_AUTH_URL"
	| "CLAMD_HOST"
	| "ADMIN_NETWORKS"
	| "ADMIN_IP_ALLOWLIST"
	| "AUTH_ALLOW_SIGNUP"
	| "MAIL_ALLOW_RESEND"
	| "PARSER_SOCKET"
	| "PROD_ACCEPT_RISKS"
	| "PASSKEY_RP_ID"
>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function productionConfigReport(
	env: Input,
	runtime: { listenHost: string | undefined },
): ConfigReport {
	const fatal: string[] = [];
	const warnings: string[] = [];
	if (env.NODE_ENV !== "production") return { fatal, warnings };

	const accepted = new Set(env.PROD_ACCEPT_RISKS);
	for (const key of accepted)
		if (!(key in PROD_RISKS))
			fatal.push(
				`PROD_ACCEPT_RISKS enthält unbekannten Wert „${key}“ (erlaubt: ${Object.keys(PROD_RISKS).join(", ")})`,
			);

	const risk = (key: ProdRisk, present: boolean) => {
		if (!present) return;
		if (accepted.has(key))
			warnings.push(
				`${PROD_RISKS[key]} (hingenommen: PROD_ACCEPT_RISKS=${key})`,
			);
		else
			fatal.push(
				`${PROD_RISKS[key]}. Beheben oder bewusst hinnehmen mit PROD_ACCEPT_RISKS=${key}`,
			);
	};

	// Nie hinnehmbar
	let url: URL | null = null;
	try {
		url = new URL(env.BETTER_AUTH_URL);
	} catch {
		url = null;
	}
	// Produktions-Build auf dem eigenen Rechner bzw. in CI (E2E gegen
	// http://localhost:3100): keine echte Installation, nur Hinweis
	if (url && LOCAL_HOSTS.has(url.hostname))
		return {
			fatal: [],
			warnings: [
				"Lokaler Produktions-Build (BETTER_AUTH_URL auf localhost): Start-Prüfung übersprungen",
			],
		};
	if (!url || url.protocol !== "https:")
		fatal.push("BETTER_AUTH_URL muss in Produktion mit https:// beginnen");
	else if (env.PASSKEY_RP_ID && !url.hostname.endsWith(env.PASSKEY_RP_ID))
		fatal.push(
			`PASSKEY_RP_ID (${env.PASSKEY_RP_ID}) passt nicht zu BETTER_AUTH_URL (${url.hostname})`,
		);
	// Die App vertraut X-Real-IP (Admin-Netz, IP-Listen). Das ist nur sicher,
	// wenn allein nginx sie erreicht: Next muss auf localhost lauschen.
	if (!LOCAL_HOSTS.has((runtime.listenHost ?? "").trim()))
		fatal.push(
			`HOSTNAME muss in Produktion 127.0.0.1 sein (ist: ${runtime.listenHost || "nicht gesetzt"}), sonst lässt sich X-Real-IP fälschen`,
		);

	// Hinnehmbar mit Vermerk
	risk("no_av", !env.CLAMD_HOST?.trim());
	risk(
		"admin_anywhere",
		env.ADMIN_NETWORKS.length === 0 && env.ADMIN_IP_ALLOWLIST.length === 0,
	);
	risk("signup_open", env.AUTH_ALLOW_SIGNUP);
	risk("mail_us", env.MAIL_ALLOW_RESEND);
	risk("parser_in_app", !env.PARSER_SOCKET);
	return { fatal, warnings };
}
