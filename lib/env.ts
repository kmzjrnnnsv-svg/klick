import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { MAIL_FROM_DEFAULT, PLATFORM_MAIL } from "./mail/address";
import { parseRanges } from "./net/ip";

// Env-Dateien werden in Prioritätsreihenfolge geladen. dotenv ist idempotent —
// die erste Datei, die eine Variable definiert, gewinnt. Production exportiert
// die Env über systemd-Credentials; interaktive Shells (`pnpm db:migrate`)
// finden dieselben Werte über `.env.production`.
const ENV_FILES = [".env.local", ".env.production", ".env"] as const;

let filesLoaded = false;

export function loadEnvFiles(): { loaded: string[] } {
	const found: string[] = [];
	for (const file of ENV_FILES) {
		// turbopackIgnore: sonst traced der Build-File-Tracer das ganze Projekt.
		const path = resolve(/* turbopackIgnore: true */ process.cwd(), file);
		if (existsSync(path)) {
			config({ path });
			found.push(file);
		}
	}
	filesLoaded = true;
	return { loaded: found };
}

export function ensureEnvLoaded(): void {
	if (!filesLoaded) loadEnvFiles();
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

const csvList = (fallback: string[]) =>
	z
		.string()
		.optional()
		.transform((v) =>
			v
				? v
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: fallback,
		);

const cidrList = csvList([]).refine(
	(list) => parseRanges(list).invalid.length === 0,
	{ message: "Liste von Netzen erwartet, z. B. 10.9.0.0/24,fd10:9::/64" },
);

// Startup-Validierung (ISO A.8.9 Konfigurationsmanagement): fehlt ein
// Pflichtwert, startet der Prozess nicht — statt irgendwo später mit
// einem undefinierten Secret weiterzulaufen.
export const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),

	DATABASE_URL: postgresUrl,
	// Separate Rolle mit DDL-Rechten für Migrationen (klick_migrator);
	// die App-Rolle (klick_app) hat weder DDL noch BYPASSRLS.
	DATABASE_URL_MIGRATE: postgresUrl.optional(),
	DATABASE_URL_TEST: postgresUrl.optional(),

	BETTER_AUTH_SECRET: z
		.string()
		.min(32, "mindestens 32 Zeichen — erzeugen mit: openssl rand -base64 33"),
	BETTER_AUTH_URL: z.url(),

	// Key-Encryption-Key, der die Org-DEKs umschließt. Rotation über
	// VAULT_KEK_BASE64_V<n> + keyVersion (P5).
	VAULT_KEK_BASE64: base64Bytes(32),
	VAULT_KEK_VERSION: z.coerce.number().int().min(1).default(1),

	S3_ENDPOINT: z.url().optional(),
	S3_REGION: z.string().default("eu-central-1"),
	S3_BUCKET: z.string().default("klick"),
	S3_ACCESS_KEY_ID: z.string().optional(),
	S3_SECRET_ACCESS_KEY: z.string().optional(),

	MAIL_FROM: z.string().default(MAIL_FROM_DEFAULT),
	RESEND_API_KEY: z.string().optional(),
	BREVO_API_KEY: z.string().optional(),
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().optional(),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),
	// Resend (USA) nur auf ausdrücklichen Wunsch: Standard ist Brevo (EU).
	MAIL_ALLOW_RESEND: flag,

	// Anbieterkennzeichnung (§ 5 DDG) und Pflichtangaben in Mails
	// (§ 35a GmbHG, § 37a HGB) — eine Quelle: lib/legal/entity.ts.
	// Adresse in Zeilen mit „;“ getrennt. Kontakt später ohne Code änderbar.
	LEGAL_NAME: z.string().optional(),
	LEGAL_FORM: z.string().optional(),
	LEGAL_ADDRESS: z.string().optional(),
	LEGAL_REPRESENTATIVES: z.string().optional(),
	LEGAL_REGISTER: z.string().optional(),
	LEGAL_VAT_ID: z.string().optional(),
	LEGAL_PHONE: z.string().optional(),
	LEGAL_CONTACT_MAIL: z.email().default(PLATFORM_MAIL),

	// Allow-List-Modus: nur bekannte Nutzer:innen bekommen Magic-Links.
	AUTH_ALLOW_SIGNUP: flag,

	MICROSOFT_CLIENT_ID: z.string().optional(),
	MICROSOFT_CLIENT_SECRET: z.string().optional(),
	MICROSOFT_TENANT_ID: z.string().optional(),

	// Benachrichtigungen in Microsoft Teams (T5): App-Registrierung von Klick
	// für mehrere Organisationen. Anmeldung bevorzugt mit Zertifikat (PEM mit
	// privatem Schlüssel und Zertifikat, als systemd-Credential); ein Geheimnis
	// geht auch. Ohne Client-ID ist Teams aus.
	TEAMS_CLIENT_ID: z.guid().optional(),
	TEAMS_CLIENT_SECRET: z.string().optional(),
	TEAMS_CERT_FILE: z.string().startsWith("/").optional(),
	// ID der Teams-App im Manifest (fest, damit Kund:innen die App erkennen)
	TEAMS_APP_ID: z.guid().default("6c7d8f4e-2b1a-4c3d-9e8f-7a6b5c4d3e2f"),
	// Push-Benachrichtigungen (Web Push, VAPID): öffentlicher Schlüssel (65 Byte,
	// base64url) und privater Schlüssel (32 Byte, Credential web_push_private_key;
	// `pnpm push:keys`). Ohne beide ist Push aus.
	// Leer zählt wie nicht gesetzt (Start-Skript ohne Credential).
	WEB_PUSH_PUBLIC_KEY: z
		.string()
		.regex(/^[A-Za-z0-9_-]{86,88}$/)
		.optional()
		.or(z.literal("")),
	WEB_PUSH_PRIVATE_KEY: z
		.string()
		.regex(/^[A-Za-z0-9_-]{42,44}$/)
		.optional()
		.or(z.literal("")),

	PASSKEY_RP_ID: z.string().optional(),
	PASSKEY_RP_NAME: z.string().default("Klick"),

	// Admin-Netz (WireGuard wg-admin, Härtung A2): /admin und Plattform-
	// Aktionen nur aus diesen Netzen (CIDR, IPv4/IPv6). Leer = überall (nur im
	// Dev; Produktion verlangt es, lib/env-checks.ts). ADMIN_IP_ALLOWLIST
	// (einzelne Adressen) gilt weiter und wird dazugenommen.
	ADMIN_NETWORKS: cidrList,
	ADMIN_IP_ALLOWLIST: cidrList,
	TRUSTED_PROXIES: csvList(["127.0.0.1", "::1"]),
	// Bewusst hingenommene Abweichungen in Produktion (lib/env-checks.ts),
	// z. B. "no_av" solange clamd fehlt. Jede Abweichung steht beim Start im Log.
	PROD_ACCEPT_RISKS: csvList([]),

	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),

	// Härtung III (optional): Malware-Scan über clamd, Rate-Limit je Org,
	// Fehler-Tracking (GlitchTip/Sentry-Store-API), eigene DB je Enterprise-Org.
	CLAMD_HOST: z.string().optional(),
	// Parser-Dienst (N6): Unix-Socket von klick-parse.socket; ohne Angabe
	// startet die App den Parser als Kindprozess mit Speicher-/Zeitgrenze
	PARSER_SOCKET: z.string().startsWith("/").optional(),
	CLAMD_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
	ORG_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(0).default(600),
	GLITCHTIP_DSN: z.url().optional(),

	KLICK_RELEASE: z.string().optional(),
	ORG_DATABASE_URLS: z
		.string()
		.optional()
		.refine(
			(v) => {
				if (!v?.trim()) return true;
				try {
					const parsed = JSON.parse(v) as unknown;
					return (
						typeof parsed === "object" &&
						parsed !== null &&
						!Array.isArray(parsed) &&
						Object.values(parsed as Record<string, unknown>).every(
							(u) => typeof u === "string" && /^postgres(ql)?:\/\//.test(u),
						)
					);
				} catch {
					return false;
				}
			},
			{ message: "JSON-Objekt { orgId: postgres://… } erwartet" },
		),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function validateEnv(
	source: Record<string, string | undefined> = process.env,
): Env {
	ensureEnvLoaded();
	const result = envSchema.safeParse(source);
	if (!result.success) {
		const lines = result.error.issues.map(
			(issue) => `  • ${issue.path.join(".") || "(root)"}: ${issue.message}`,
		);
		throw new Error(`Ungültige Umgebungskonfiguration:\n${lines.join("\n")}`);
	}
	cached = result.data;
	return cached;
}

export function env(): Env {
	return cached ?? validateEnv();
}

// Nur für Tests.
export function resetEnvCache(): void {
	cached = null;
}

export const isProduction = (): boolean => env().NODE_ENV === "production";
