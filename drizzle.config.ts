import { defineConfig } from "drizzle-kit";
import { loadEnvFiles } from "./lib/env";

loadEnvFiles();

// Migrationen laufen mit der DDL-Rolle (klick_migrator); die App-Rolle hat
// kein DDL und kein BYPASSRLS. `generate` braucht keine echte Verbindung.
export default defineConfig({
	out: "./db/migrations",
	schema: ["./db/schema.ts", "./db/auth-schema.ts"],
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.DATABASE_URL_MIGRATE ??
			process.env.DATABASE_URL ??
			"postgres://localhost:5432/klick",
	},
	casing: "snake_case",
	strict: true,
	verbose: false,
});
