import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// E2E (P4): läuft gegen einen gebauten Server. Lokal: `pnpm build && pnpm test:e2e`
// (startet `next start` auf 3100); CI/anderer Server: E2E_BASE_URL setzen.
// Chromium ist in der Dev-Umgebung vorinstalliert (PLAYWRIGHT_BROWSERS_PATH).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
// Dev-Container: vorinstalliertes Chromium statt Download (Version passt sonst
// nicht zur @playwright/test-Version). CI installiert den passenden Browser.
const localChromium =
	process.env.PW_CHROMIUM_PATH ??
	(!process.env.CI && existsSync("/opt/pw-browsers/chromium")
		? "/opt/pw-browsers/chromium"
		: undefined);

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["list"]] : "list",
	timeout: 30_000,
	use: {
		baseURL,
		trace: "retain-on-failure",
		locale: "de-DE",
		timezoneId: "Europe/Berlin",
		...(localChromium
			? { launchOptions: { executablePath: localChromium } }
			: {}),
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
	webServer: process.env.E2E_BASE_URL
		? undefined
		: {
				command: "pnpm start -p 3100",
				url: "http://localhost:3100/api/health",
				timeout: 120_000,
				reuseExistingServer: !process.env.CI,
				env: { KLICK_DISABLE_JOBS: "true" },
			},
});
