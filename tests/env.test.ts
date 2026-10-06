import { describe, expect, it } from "vitest";
import { envSchema, validateEnv } from "@/lib/env";

const kek = Buffer.alloc(32, 7).toString("base64");
const valid = {
	DATABASE_URL: "postgres://klick_app:x@localhost:5432/klick",
	BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef0123456789",
	BETTER_AUTH_URL: "http://localhost:3000",
	VAULT_KEK_BASE64: kek,
};

describe("env", () => {
	it("akzeptiert eine minimale gültige Konfiguration mit Defaults", () => {
		const env = validateEnv(valid);
		expect(env.NODE_ENV).toBe("development");
		expect(env.LOG_LEVEL).toBe("info");
		expect(env.TRUSTED_PROXIES).toEqual(["127.0.0.1", "::1"]);
		expect(env.ADMIN_IP_ALLOWLIST).toEqual([]);
		expect(env.AUTH_ALLOW_SIGNUP).toBe(false);
		expect(env.VAULT_KEK_VERSION).toBe(1);
	});

	it("bricht ohne BETTER_AUTH_SECRET mit sprechender Meldung ab", () => {
		const { BETTER_AUTH_SECRET: _omit, ...rest } = valid;
		expect(() => validateEnv(rest)).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("verweigert einen KEK mit falscher Länge", () => {
		const res = envSchema.safeParse({
			...valid,
			VAULT_KEK_BASE64: Buffer.alloc(16).toString("base64"),
		});
		expect(res.success).toBe(false);
	});

	it("verweigert Nicht-Postgres-URLs", () => {
		expect(
			envSchema.safeParse({ ...valid, DATABASE_URL: "mysql://x" }).success,
		).toBe(false);
	});

	it("parst Listen", () => {
		const env = validateEnv({
			...valid,
			ADMIN_IP_ALLOWLIST: " 1.2.3.4, 5.6.7.8 ",
		});
		expect(env.ADMIN_IP_ALLOWLIST).toEqual(["1.2.3.4", "5.6.7.8"]);
	});
});
