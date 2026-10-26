import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import { parseRanges } from "@/lib/net/ip";

// Umgebung von both.money. Eigene Namen mit Präfix WALLET_, damit die App nie
// versehentlich Klicks Datenbank, Schlüssel oder Auth-URL übernimmt — beide
// Dienste können auf demselben Server laufen. Gemeinsam sind nur Mailweg
// (BREVO_*/SMTP_*), Anbieterkennzeichnung (LEGAL_*) und Logging.

// Env-Dateien der App (nicht die der Wurzel). Next lädt sie im Server selbst;
// Skripte laufen aus der Repo-Wurzel und brauchen diesen Weg.
const ENV_FILES = [".env.local", ".env.production", ".env"] as const;

let filesLoaded = false;

export function walletDir(): string {
	const fromRoot = resolve(
		/* turbopackIgnore: true */ process.cwd(),
		"apps/wallet",
	);
	return existsSync(fromRoot) ? fromRoot : process.cwd();
}

export function loadWalletEnvFiles(): { loaded: string[] } {
	const found: string[] = [];
	const dir = walletDir();
	for (const file of ENV_FILES) {
		const path = resolve(/* turbopackIgnore: true */ dir, file);
		if (existsSync(path)) {
			config({ path, quiet: true });
			found.push(file);
		}
	}
	filesLoaded = true;
	return { loaded: found };
}

export function ensureWalletEnvLoaded(): void {
	if (!filesLoaded) loadWalletEnvFiles();
}

const postgresUrl = z
	.string()
	.regex(/^postgres(ql)?:\/\//, "muss mit postgres:// beginnen");

const base64Bytes = (bytes: number) =>
	z.string().refine(
		(v) => {
			try {
				return Buffer.from(v, "base64").length === bytes;
			} catch {
				return false;
			}
		},
		{ message: `muss ${bytes} Byte, base64-kodiert, sein` },
	);

const flag = z
	.enum(["true", "false"])
	.default("false")
	.transform((v) => v === "true");

export const walletEnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		// Eigene Datenbank (wallet, Rolle wallet_app); Migrationen mit
		// wallet_migrator, Tests gegen wallet_test
		WALLET_DATABASE_URL: postgresUrl,
		WALLET_DATABASE_URL_MIGRATE: postgresUrl.optional(),
		WALLET_DATABASE_URL_TEST: postgresUrl.optional(),

		// Öffentliche Adresse der App (Passkeys, Links in Mails, Server Actions)
		WALLET_AUTH_URL: z.url().optional(),
		WALLET_AUTH_SECRET: z
			.string()
			.min(32, "mindestens 32 Zeichen — erzeugen mit: openssl rand -base64 33"),
		// Relying Party der Passkeys: both.money (nie ändern — bricht alle Passkeys)
		WALLET_PASSKEY_RP_ID: z.string().optional(),

		// KEK für die Org-DEKs (eigener Schlüssel, nie Klicks VAULT_KEK)
		WALLET_VAULT_KEK_BASE64: base64Bytes(32),
		WALLET_VAULT_KEK_VERSION: z.coerce.number().int().min(1).default(1),

		// Absender der Mails. Bis die Domain both.money im Mail-Dienst bestätigt
		// ist, über die Plattform-Adresse (deploy/README.md, „both.money“).
		WALLET_MAIL_FROM: z.string().default(`both.money <${PLATFORM_MAIL}>`),
		BREVO_API_KEY: z.string().optional(),
		SMTP_HOST: z.string().optional(),
		SMTP_PORT: z.coerce.number().int().optional(),

		// Anbieterkennzeichnung wie bei Klick (lib/legal/entity.ts)
		LEGAL_NAME: z.string().optional(),
		LEGAL_FORM: z.string().optional(),
		LEGAL_ADDRESS: z.string().optional(),
		LEGAL_REPRESENTATIVES: z.string().optional(),
		LEGAL_REGISTER: z.string().optional(),
		LEGAL_VAT_ID: z.string().optional(),
		LEGAL_PHONE: z.string().optional(),
		LEGAL_CONTACT_MAIL: z.email().default(PLATFORM_MAIL),

		// Eigene Knoten (über WireGuard), Zugangsdaten in der URL — nie in Logs
		WALLET_RPC_BITCOIN_SIGNET: z.url().optional(),
		WALLET_RPC_BITCOIN_MAINNET: z.url().optional(),
		WALLET_RPC_ETHEREUM_SEPOLIA: z.url().optional(),
		WALLET_RPC_ETHEREUM_MAINNET: z.url().optional(),
		// Signer (app.sock) und Herkunft der Bestätigungsseite
		// (approve.both.money); ohne Socket kein Senden, nur Empfangen
		WALLET_SIGNER_SOCKET: z.string().startsWith("/").optional(),
		WALLET_CONFIRM_ORIGIN: z
			.string()
			.regex(/^(https:\/\/[a-z0-9.-]+|http:\/\/localhost(:\d{1,5})?)$/)
			.optional(),

		// Klick-Herkünfte, an die der Compliance-Export gehen darf (Komma-
		// getrennt). Andere Adressen lehnt die Einstellung ab.
		WALLET_KLICK_ORIGINS: z
			.string()
			.default("https://raza.work")
			.transform((v) =>
				v
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			)
			.pipe(
				z.array(
					z
						.string()
						.regex(
							/^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/,
							"https://<host> (lokal http://localhost:<port>)",
						),
				),
			),

		// Admin-Netz (WireGuard wg-admin) für Plattform-Verwaltung im Browser,
		// Komma-getrennt; leer = keine Einschränkung (Härtung W, wie Klicks
		// ADMIN_NETWORKS). Die Verwaltung läuft heute am Terminal.
		WALLET_ADMIN_NETWORKS: z
			.string()
			.default("")
			.transform((v) =>
				v
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			)
			.refine((list) => parseRanges(list).invalid.length === 0, {
				message: "Liste von Netzen erwartet, z. B. 10.9.0.0/24",
			}),

		LOG_LEVEL: z
			.enum(["trace", "debug", "info", "warn", "error", "fatal"])
			.default("info"),
		GLITCHTIP_DSN: z.url().optional(),
		WALLET_RELEASE: z.string().optional(),
		// Hintergrund-Jobs aus (CI, Tests, zweiter Prozess)
		WALLET_DISABLE_JOBS: flag,
	})
	.superRefine((env, ctx) => {
		if (env.NODE_ENV === "production" && !env.WALLET_AUTH_URL)
			ctx.addIssue({
				code: "custom",
				path: ["WALLET_AUTH_URL"],
				message: "in Produktion Pflicht (z. B. https://both.money)",
			});
	});

export type WalletEnv = z.infer<typeof walletEnvSchema>;

let cached: WalletEnv | null = null;

// Startup-Validierung: fehlt ein Pflichtwert, startet der Prozess nicht.
export function validateWalletEnv(
	source: Record<string, string | undefined> = process.env,
): WalletEnv {
	if (source === process.env) ensureWalletEnvLoaded();
	const parsed = walletEnvSchema.safeParse(source);
	if (!parsed.success) {
		const lines = parsed.error.issues.map(
			(i) => `  • ${i.path.join(".")}: ${i.message}`,
		);
		throw new Error(
			`Ungültige Umgebungskonfiguration (both.money):\n${lines.join("\n")}`,
		);
	}
	if (source === process.env) cached = parsed.data;
	return parsed.data;
}

export function walletEnv(): WalletEnv {
	return cached ?? validateWalletEnv();
}
