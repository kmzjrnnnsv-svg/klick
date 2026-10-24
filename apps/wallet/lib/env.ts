import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { PLATFORM_MAIL } from "@/lib/mail/address";

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

const flag = z
	.enum(["true", "false"])
	.default("false")
	.transform((v) => v === "true");

export const walletEnvSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		// Öffentliche Adresse der App (Passkeys, Links in Mails, Server Actions)
		WALLET_AUTH_URL: z.url().optional(),

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
	source: NodeJS.ProcessEnv = process.env,
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
