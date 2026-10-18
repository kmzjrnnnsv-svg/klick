import { expect, test } from "@playwright/test";

// Login-Seite: Passkey zuerst (ADR-019), E-Mail-Feld für SSO/Autofill, kein
// horizontales Scrollen auf dem Telefon (UX-Leitlinie); Notweg mit
// Mail-Link antwortet für bekannte und unbekannte E-Mail identisch (kein
// User-Enumeration).
test.describe("Login", () => {
	test("zeigt E-Mail-Feld und Passkey", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByRole("textbox", { name: /e-mail/i })).toBeVisible();
		await expect(page.locator('input[name="email"]')).toHaveAttribute(
			"type",
			"email",
		);
		await expect(page.getByRole("button", { name: /passkey/i })).toBeVisible();
		await expect(page.locator('input[name="email"]')).toHaveAttribute(
			"autocomplete",
			"username webauthn",
		);
		await expect(
			page.getByRole("link", { name: /anmelde-link per mail/i }),
		).toHaveAttribute("href", "/login/notweg");
	});

	test("kein horizontales Scrollen bei 375 px", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 740 });
		for (const path of ["/login", "/login/notweg"]) {
			await page.goto(path);
			const widths = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth,
			}));
			expect(widths.scroll).toBeLessThanOrEqual(widths.client);
		}
	});

	test("unbekannte E-Mail erzeugt keine Fehlermeldung mit Hinweis auf Existenz", async ({
		page,
	}) => {
		await page.goto("/login/notweg");
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

	test("Aktivierungslink: ohne Token Hinweis, falscher Token ungültig", async ({
		page,
	}) => {
		await page.goto("/aktivieren");
		await expect(page.getByText(/Link ist unvollständig/)).toBeVisible();
		await page.goto("/aktivieren#klk_activate_ungueltig");
		await expect(page.getByText(/Aktivierungslink ist ungültig/)).toBeVisible();
		// kein Mail-Notweg als Ausweg — angelegte Konten nur per Passkey
		await expect(page.getByText("Per Mail-Link anmelden")).toHaveCount(0);
	});
});
