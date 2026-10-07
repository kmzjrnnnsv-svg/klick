import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnvFiles } from "../lib/env";

// Migrationen laufen mit der DDL-Rolle (DATABASE_URL_MIGRATE → klick_migrator).
// Fällt auf DATABASE_URL zurück, falls nur eine Rolle konfiguriert ist (Dev).
async function main() {
	const { loaded } = loadEnvFiles();
	const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;

	if (!url) {
		console.error(
			"\n✗ DATABASE_URL_MIGRATE / DATABASE_URL ist nicht gesetzt.\n",
		);
		console.error("  Geprüfte Env-Dateien:");
		for (const file of [".env.local", ".env.production", ".env"]) {
			console.error(
				`    ${resolve(process.cwd(), file)}  [${loaded.includes(file) ? "geladen" : "fehlt"}]`,
			);
		}
		process.exit(1);
	}

	const migrationsFolder = resolve(process.cwd(), "db/migrations");
	const sql = postgres(url, { max: 1 });
	const db = drizzle(sql);
	try {
		console.log(`→ Wende Migrationen aus ${migrationsFolder} an…`);
		await migrate(db, { migrationsFolder });
		console.log("✔ Migrationen aktuell.");
	} finally {
		await sql.end({ timeout: 5 });
	}
}

main().catch((err) => {
	console.error("\n✗ Migration fehlgeschlagen:");
	console.error(err);
	process.exit(1);
});
