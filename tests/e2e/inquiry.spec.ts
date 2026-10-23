import { expect, test } from "@playwright/test";

// Öffentliches Anfrageformular: nur JSON von der eigenen Herkunft; Bots
// (Honeypot) bekommen dieselbe Antwort wie Menschen, aber nichts wird
// gespeichert. API-Fälle nur im Desktop-Projekt — das Limit (5 je IP in
// 10 Minuten) gilt für den ganzen Testlauf.
test.describe("Anfrage", () => {
	test("Formular steht auf /leistungen", async ({ page }) => {
		await page.goto("/leistungen#anfrage");
		const form = page.locator("#anfrage form");
		await expect(form.getByLabel("E-Mail")).toBeVisible();
		await expect(form.getByLabel("Worum geht es?")).toBeVisible();
		await expect(
			form.getByRole("link", { name: "Datenschutzerklärung" }),
		).toHaveAttribute("href", "/datenschutz-erklaerung");
		await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
	});

	test("fremde Herkunft oder kein JSON → 403", async ({
		request,
		baseURL,
	}, info) => {
		test.skip(info.project.name !== "chromium");
		const foreign = await request.post("/api/anfrage", {
			headers: { origin: "https://evil.example" },
			data: {},
		});
		expect(foreign.status()).toBe(403);
		const form = await request.post("/api/anfrage", {
			headers: { origin: new URL(baseURL ?? "").origin },
			form: { name: "x" },
		});
		expect(form.status()).toBe(403);
	});

	test("Honeypot → 204, ungültig → 400", async ({ request, baseURL }, info) => {
		test.skip(info.project.name !== "chromium");
		const origin = new URL(baseURL ?? "").origin;
		const bot = await request.post("/api/anfrage", {
			headers: { origin },
			data: {
				service: "general",
				name: "Bot",
				email: "bot@example.org",
				message: "Kaufen Sie jetzt unsere Produkte!",
				business: true,
				website: "https://spam.example",
				renderedAt: Date.now() - 60_000,
			},
		});
		expect(bot.status()).toBe(204);
		const invalid = await request.post("/api/anfrage", {
			headers: { origin },
			data: {
				service: "general",
				name: "Erika",
				email: "keine-adresse",
				message: "Bitte um Rückruf zur Gap-Analyse.",
				business: false,
				renderedAt: Date.now() - 60_000,
			},
		});
		expect(invalid.status()).toBe(400);
		const body = await invalid.json();
		expect(Object.keys(body.fieldErrors)).toEqual(
			expect.arrayContaining(["email", "business"]),
		);
	});
});
