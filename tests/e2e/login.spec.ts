import { expect, test } from "@playwright/test";

// Login-Seite: Magic-Link-Formular, Passkey-Option, kein horizontales
// Scrollen auf dem Telefon (UX-Leitlinie), identische Antwort für bekannte
// und unbekannte E-Mail (kein User-Enumeration).
test.describe("Login", () => {
	test("zeigt E-Mail-Feld und Passkey", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByRole("textbox", { name: /e-mail/i })).toBeVisible();
		await expect(page.locator('input[name="email"]')).toHaveAttribute(
			"type",
			"email",
		);
		await expect(page.getByRole("button", { name: /passkey/i })).toBeVisible();
	});

	test("kein horizontales Scrollen bei 375 px", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 740 });
		await page.goto("/login");
		const widths = await page.evaluate(() => ({
			scroll: document.documentElement.scrollWidth,
			client: document.documentElement.clientWidth,
		}));
		expect(widths.scroll).toBeLessThanOrEqual(widths.client);
	});

	test("unbekannte E-Mail erzeugt keine Fehlermeldung mit Hinweis auf Existenz", async ({
		page,
	}) => {
		await page.goto("/login");
		await page.locator('input[name="email"]').fill("niemand@example.invalid");
		await page.getByRole("button", { name: /link/i }).first().click();
		// Entweder neutrale Bestätigung oder Weiterleitung auf /login/verify —
		// nie „unbekannt“/„nicht gefunden“.
		await page.waitForTimeout(1500);
		const text = (await page.locator("body").innerText()).toLowerCase();
		expect(text).not.toMatch(
			/nicht gefunden|unbekannt|existiert nicht|not found/,
		);
	});
});
