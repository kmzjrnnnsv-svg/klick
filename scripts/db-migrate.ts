import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadEnvFiles } from "../lib/env";

async function main() {
	const { loaded } = loadEnvFiles();

	if (!process.env.DATABASE_URL) {
		const cwd = process.cwd();
		console.error("\n✗ DATABASE_URL ist nicht gesetzt.\n");
		console.error("  drizzle-kit kann ohne Connection-String nicht migrieren.");
		console.error("  Geprüfte Env-Dateien (in dieser Reihenfolge):");
		for (const file of [".env.local", ".env.production", ".env"]) {
			const status = loaded.includes(file) ? "geladen" : "fehlt";
			console.error(`    ${resolve(cwd, file)}  [${status}]`);
		}
		console.error("\n  Lösung:");
		console.error("    • Dev:   `cp .env.example .env.local` und DATABASE_URL setzen");
		console.error(
			"    • Prod:  `.env.production` neben package.json anlegen (gleiche",
		);
		console.error(
			"             Datei wie der systemd-EnvironmentFile), oder DATABASE_URL",
		);
		console.error("             vor dem Aufruf in der Shell exportieren.\n");
		process.exit(1);
	}

	const migrationsFolder = resolve(process.cwd(), "db/migrations");
	const sql = postgres(process.env.DATABASE_URL, { max: 1 });
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
