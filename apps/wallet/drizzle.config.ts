import { defineConfig } from "drizzle-kit";
import { loadWalletEnvFiles } from "./lib/env";

loadWalletEnvFiles();

// both.money: eigene Migrationen (apps/wallet/db/migrations), eigene DB.
// Aufruf aus der Repo-Wurzel: pnpm db:wallet:generate --name=…
export default defineConfig({
	out: "./apps/wallet/db/migrations",
	schema: ["./apps/wallet/db/schema.ts", "./apps/wallet/db/auth-schema.ts"],
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.WALLET_DATABASE_URL_MIGRATE ??
			process.env.WALLET_DATABASE_URL ??
			"postgres://localhost:5432/wallet",
	},
	casing: "snake_case",
	strict: true,
	verbose: false,
});
