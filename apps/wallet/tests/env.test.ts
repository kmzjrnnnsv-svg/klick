import { validateWalletEnv } from "@wallet/lib/env";
import { describe, expect, it } from "vitest";

describe("Umgebung both.money", () => {
	it("Produktion verlangt WALLET_AUTH_URL", () => {
		expect(() => validateWalletEnv({ NODE_ENV: "production" })).toThrow(
			/WALLET_AUTH_URL/,
		);
		const env = validateWalletEnv({
			NODE_ENV: "production",
			WALLET_AUTH_URL: "https://both.money",
		});
		expect(env.WALLET_AUTH_URL).toBe("https://both.money");
	});

	it("übernimmt keine Klick-Werte", () => {
		const env = validateWalletEnv({
			NODE_ENV: "development",
			DATABASE_URL: "postgres://klick_app@localhost/klick",
			BETTER_AUTH_URL: "https://raza.work",
			MAIL_FROM: "Klick <no-reply@raza.work>",
		});
		expect(env).not.toHaveProperty("DATABASE_URL");
		expect(env).not.toHaveProperty("BETTER_AUTH_URL");
		expect(env.WALLET_MAIL_FROM).toMatch(/^both\.money </);
		expect(env.WALLET_DISABLE_JOBS).toBe(false);
	});
});
