import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { loadEnvFiles } from "./lib/env";

// .env.local liefert lokal DATABASE_URL_TEST für die RLS-Integrationstests.
loadEnvFiles();

// Server-Code ist der Normalfall → Node-Umgebung. Komponenten-Tests setzen
// `// @vitest-environment happy-dom` als erste Zeile.
export default defineConfig({
	plugins: [react()],
	test: {
		environment: "node",
		include: ["tests/**/*.test.{ts,tsx}"],
		exclude: ["tests/e2e/**", "node_modules/**"],
		globals: false,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "."),
		},
	},
});
