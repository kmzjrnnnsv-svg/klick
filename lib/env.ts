import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

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

	MAIL_FROM: z.string().default("Klick <noreply@klick.local>"),
	RESEND_API_KEY: z.string().optional(),
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().optional(),
	SMTP_USER: z.string().optional(),
	SMTP_PASS: z.string().optional(),

	// Allow-List-Modus: nur bekannte Nutzer:innen bekommen Magic-Links.
	AUTH_ALLOW_SIGNUP: flag,

	MICROSOFT_CLIENT_ID: z.string().optional(),
	MICROSOFT_CLIENT_SECRET: z.string().optional(),
	MICROSOFT_TENANT_ID: z.string().optional(),

	PASSKEY_RP_ID: z.string().optional(),
	PASSKEY_RP_NAME: z.string().default("Klick"),

	ADMIN_IP_ALLOWLIST: csvList([]),
	TRUSTED_PROXIES: csvList(["127.0.0.1", "::1"]),

	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
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
