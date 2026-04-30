import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "happy-dom",
		include: ["tests/**/*.test.{ts,tsx}"],
		globals: false,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "."),
		},
	},
});
