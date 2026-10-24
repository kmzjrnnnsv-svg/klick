import { validateWalletEnv } from "@wallet/lib/env";
import { describe, expect, it } from "vitest";

const BASE = {
	WALLET_DATABASE_URL: "postgres://wallet_app@localhost/wallet",
	WALLET_AUTH_SECRET: "test-only-secret-0123456789abcdef0123456789",
	WALLET_VAULT_KEK_BASE64: Buffer.alloc(32, 1).toString("base64"),
};

describe("Umgebung both.money", () => {
	it("Produktion verlangt WALLET_AUTH_URL", () => {
		expect(() =>
			validateWalletEnv({ ...BASE, NODE_ENV: "production" }),
		).toThrow(/WALLET_AUTH_URL/);
		const env = validateWalletEnv({
			...BASE,
			NODE_ENV: "production",
			WALLET_AUTH_URL: "https://both.money",
		});
		expect(env.WALLET_AUTH_URL).toBe("https://both.money");
	});

	it("übernimmt keine Klick-Werte", () => {
		const env = validateWalletEnv({
			...BASE,
			NODE_ENV: "development",
			DATABASE_URL: "postgres://klick_app@localhost/klick",
			BETTER_AUTH_URL: "https://raza.work",
			MAIL_FROM: "Klick <no-reply@raza.work>",
		});
		expect(env).not.toHaveProperty("DATABASE_URL");
		expect(env).not.toHaveProperty("BETTER_AUTH_URL");
		expect(env.WALLET_MAIL_FROM).toMatch(/^both\.money </);
		expect(env.WALLET_DISABLE_JOBS).toBe(false);
		expect(() =>
			validateWalletEnv({ ...BASE, WALLET_VAULT_KEK_BASE64: "kurz" }),
		).toThrow(/WALLET_VAULT_KEK_BASE64/);
	});
});
