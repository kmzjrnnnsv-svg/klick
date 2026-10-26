import { describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env";
import { PROD_RISKS, productionConfigReport } from "@/lib/env-checks";

// Start-Prüfung (Härtung A6): unsichere Standardwerte verhindern den Start in
// Produktion, außer sie sind ausdrücklich hingenommen.

const kek = Buffer.alloc(32, 7).toString("base64");
const prod = (extra: Record<string, string> = {}) =>
	validateEnv({
		NODE_ENV: "production",
		DATABASE_URL: "postgres://klick_app:x@localhost:5432/klick",
		BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef0123456789",
		BETTER_AUTH_URL: "https://raza.work",
		PASSKEY_RP_ID: "raza.work",
		VAULT_KEK_BASE64: kek,
		CLAMD_HOST: "127.0.0.1",
		ADMIN_NETWORKS: "10.9.0.0/24,fd10:9::/64",
		PARSER_SOCKET: "/run/klick-parse.sock",
		...extra,
	});
const local = { listenHost: "127.0.0.1" };

describe("productionConfigReport", () => {
	it("vollständige Produktion: kein Befund", () => {
		expect(productionConfigReport(prod(), local)).toEqual({
			fatal: [],
			warnings: [],
		});
	});

	it("Dev und Test werden nicht geprüft", () => {
		const env = {
			...prod(),
			NODE_ENV: "development" as const,
			CLAMD_HOST: undefined,
		};
		expect(
			productionConfigReport(env, { listenHost: "0.0.0.0" }).fatal,
		).toEqual([]);
	});

	it("fehlender Virenscanner, Admin-Netz und Parser verhindern den Start", () => {
		const env = {
			...prod(),
			CLAMD_HOST: undefined,
			ADMIN_NETWORKS: [],
			PARSER_SOCKET: undefined,
		};
		const r = productionConfigReport(env, local);
		expect(r.fatal).toHaveLength(3);
		expect(r.fatal.join(" ")).toContain("PROD_ACCEPT_RISKS=no_av");
		expect(r.fatal.join(" ")).toContain("PROD_ACCEPT_RISKS=admin_anywhere");
		expect(r.fatal.join(" ")).toContain("PROD_ACCEPT_RISKS=parser_in_app");
	});

	it("hingenommene Abweichung wird zur Warnung", () => {
		const env = {
			...prod({ PROD_ACCEPT_RISKS: "no_av" }),
			CLAMD_HOST: undefined,
		};
		const r = productionConfigReport(env, local);
		expect(r.fatal).toEqual([]);
		expect(r.warnings).toEqual([expect.stringContaining("hingenommen")]);
	});

	it("offene Registrierung und US-Mail nur mit Vermerk", () => {
		const r = productionConfigReport(
			prod({ AUTH_ALLOW_SIGNUP: "true", MAIL_ALLOW_RESEND: "true" }),
			local,
		);
		expect(r.fatal).toHaveLength(2);
		const ok = productionConfigReport(
			prod({
				AUTH_ALLOW_SIGNUP: "true",
				MAIL_ALLOW_RESEND: "true",
				PROD_ACCEPT_RISKS: "signup_open, mail_us",
			}),
			local,
		);
		expect(ok.fatal).toEqual([]);
		expect(ok.warnings).toHaveLength(2);
	});

	it("nie hinnehmbar: http, falsche RP-ID, App nicht auf localhost, unbekannter Vermerk", () => {
		expect(
			productionConfigReport(
				prod({ BETTER_AUTH_URL: "http://raza.work" }),
				local,
			).fatal,
		).toEqual([expect.stringContaining("https://")]);
		expect(
			productionConfigReport(prod({ PASSKEY_RP_ID: "both.money" }), local)
				.fatal,
		).toEqual([expect.stringContaining("PASSKEY_RP_ID")]);
		expect(
			productionConfigReport(prod(), { listenHost: "0.0.0.0" }).fatal,
		).toEqual([expect.stringContaining("HOSTNAME")]);
		expect(
			productionConfigReport(prod(), { listenHost: undefined }).fatal,
		).toHaveLength(1);
		expect(
			productionConfigReport(prod({ PROD_ACCEPT_RISKS: "alles" }), local).fatal,
		).toEqual([expect.stringContaining("unbekannten Wert")]);
	});

	it("lokaler Produktions-Build (CI, E2E) wird übersprungen", () => {
		const env = {
			...prod({ BETTER_AUTH_URL: "http://localhost:3100" }),
			CLAMD_HOST: undefined,
		};
		const r = productionConfigReport(env, { listenHost: undefined });
		expect(r.fatal).toEqual([]);
		expect(r.warnings).toHaveLength(1);
	});

	it("jeder Vermerk hat einen Text", () => {
		for (const [key, text] of Object.entries(PROD_RISKS)) {
			expect(key).toMatch(/^[a-z_]+$/);
			expect(text.length).toBeGreaterThan(20);
		}
	});
});

describe("ADMIN_NETWORKS", () => {
	it("nimmt CIDR beider Familien, lehnt Unsinn ab", () => {
		expect(prod().ADMIN_NETWORKS).toEqual(["10.9.0.0/24", "fd10:9::/64"]);
		expect(() => prod({ ADMIN_NETWORKS: "10.9.0.0/24,wg-admin" })).toThrow(
			/ADMIN_NETWORKS/,
		);
	});
});
