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

	// Safari zeigt das Passkey-Fenster manchmal nicht, und die Anfrage
	// antwortet nie. Nachgestellt: credentials.get endet nur bei Abbruch.
	test("Passkey-Fenster erscheint nicht: Abbrechen, SSO und Zeitgrenze", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			navigator.credentials.get = (options?: CredentialRequestOptions) =>
				new Promise((_, reject) => {
					options?.signal?.addEventListener("abort", () =>
						reject(new DOMException("abgebrochen", "AbortError")),
					);
				});
		});
		await page.clock.install();
		await page.goto("/login");
		const passkey = page.getByRole("button", { name: /mit passkey/i });
		await passkey.click();
		await expect(
			page.getByRole("button", { name: /warte auf deinen passkey/i }),
		).toBeDisabled();
		// SSO bleibt bedienbar, „Abbrechen“ gibt den Knopf frei
		await expect(
			page.getByRole("button", { name: /firmen-login/i }),
		).toBeEnabled();
		await page.getByRole("button", { name: "Abbrechen" }).click();
		await expect(passkey).toBeEnabled();
		// kein Fehler nach eigenem Abbruch (role="alert" trägt auch der
		// Routen-Ansager von Next, deshalb über den Text)
		await expect(page.getByText(/abgebrochen|keine antwort/i)).toHaveCount(0);
		// Ohne Antwort nach 90 s: Meldung am Formular, Knopf wieder frei
		await passkey.click();
		await expect(page.getByRole("button", { name: "Abbrechen" })).toBeVisible();
		await page.clock.fastForward(91_000);
		await expect(
			page.getByRole("alert").filter({ hasText: "Keine Antwort vom Passkey" }),
		).toBeVisible();
		await expect(passkey).toBeEnabled();
	});

	// Scheitert die Anfrage an Klick auf Netzebene, wirft Better Auth statt
	// { error } zurückzugeben; das Formular darf dann nicht hängen bleiben
	test("Anfrage an Klick bricht ab: Meldung mit technischem Hinweis", async ({
		page,
	}) => {
		await page.route(
			"**/api/auth/passkey/generate-authenticate-options*",
			(r) => r.abort("connectionreset"),
		);
		await page.goto("/login");
		const passkey = page.getByRole("button", { name: /mit passkey/i });
		await passkey.click();
		await expect(
			page
				.getByRole("alert")
				.filter({ hasText: "Anmeldung beim Server nicht starten" }),
		).toBeVisible();
		await expect(page.getByText(/Technischer Hinweis: /)).toBeVisible();
		await expect(passkey).toBeEnabled();
		await expect(
			page.getByRole("button", { name: /firmen-login/i }),
		).toBeEnabled();
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
