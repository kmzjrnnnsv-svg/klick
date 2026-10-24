import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadWalletEnvFiles, walletDir } from "../lib/env";

// Migrationen von both.money mit der DDL-Rolle (WALLET_DATABASE_URL_MIGRATE →
// wallet_migrator). Läuft nur gegen die Datenbanken wallet und wallet_test —
// Klicks Datenbank bleibt unberührt, auch bei vertauschter URL. Dieselbe
// Sperre steht zusätzlich in 0000_init (Block A).
export const ALLOWED_DATABASES = ["wallet", "wallet_test"] as const;

export function databaseAllowed(name: string | null | undefined): boolean {
	return (ALLOWED_DATABASES as readonly string[]).includes(name ?? "");
}

async function main() {
	const { loaded } = loadWalletEnvFiles();
	const url =
		process.env.WALLET_DATABASE_URL_MIGRATE ?? process.env.WALLET_DATABASE_URL;
	if (!url) {
		console.error(
			`\n✗ WALLET_DATABASE_URL_MIGRATE / WALLET_DATABASE_URL fehlt (Env-Dateien in ${walletDir()}: ${loaded.join(", ") || "keine"}).\n`,
		);
		process.exit(1);
	}
	const named = new URL(url).pathname.replace(/^\//, "");
	if (!databaseAllowed(named)) {
		console.error(
			`\n✗ Verweigert: Datenbank „${named}“ ist nicht wallet/wallet_test.\n`,
		);
		process.exit(1);
	}
	const sql = postgres(url, { max: 1 });
	try {
		const [{ db } = { db: "" }] = await sql<
			{ db: string }[]
		>`select current_database() as db`;
		if (!databaseAllowed(db)) {
			console.error(`\n✗ Verweigert: verbunden mit „${db}“.\n`);
			process.exit(1);
		}
		const migrationsFolder = resolve(walletDir(), "db/migrations");
		console.log(`→ both.money: Migrationen aus ${migrationsFolder} auf ${db}…`);
		await migrate(drizzle(sql), { migrationsFolder });
		console.log("✔ Migrationen aktuell.");
	} finally {
		await sql.end({ timeout: 5 });
	}
}

if (process.argv[1]?.endsWith("db-migrate.ts"))
	main().catch((err) => {
		console.error("\n✗ Migration fehlgeschlagen:");
		console.error(err);
		process.exit(1);
	});
