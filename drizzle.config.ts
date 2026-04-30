import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
	out: "./db/migrations",
	schema: "./db/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: required at boot
		url: process.env.DATABASE_URL!,
	},
	casing: "snake_case",
});
