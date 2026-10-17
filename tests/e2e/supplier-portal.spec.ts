import { expect, test } from "@playwright/test";

// Lieferantenportal (ADR-017): ohne gültigen Portal-Token kein Zugang, keine
// Details; der Token kommt nur im Fragment und wird gegen ein Cookie getauscht.
test.describe("Lieferantenportal ohne Token", () => {
	test("Seite ohne Cookie zeigt den Hinweis auf den Einladungslink", async ({
		page,
	}) => {
		const res = await page.goto("/lieferant");
		expect(res?.status()).toBe(200);
		await expect(
			page.getByRole("heading", {
				name: "Bitte öffne den Link aus der Einladung.",
			}),
		).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			"content",
			/noindex/,
		);
	});

	test("ungültiger Token im Fragment → Hinweis, kein Cookie", async ({
		page,
		context,
	}) => {
		await page.goto(`/lieferant#klk_portal_${"A".repeat(43)}`);
		await expect(
			page.getByRole("heading", { name: "Dieser Link ist ungültig." }),
		).toBeVisible();
		expect(page.url()).not.toContain("klk_portal_");
		const cookies = await context.cookies();
		expect(cookies.some((c) => c.name === "klick_portal")).toBe(false);
	});

	test("Sitzungs-Tausch ohne/mit falschem Token → 401", async ({ request }) => {
		const none = await request.post("/api/lieferant/sitzung", { data: {} });
		expect(none.status()).toBe(401);
		const fake = await request.post("/api/lieferant/sitzung", {
			data: { token: `klk_portal_${"B".repeat(43)}` },
		});
		expect(fake.status()).toBe(401);
		expect(await fake.json()).toEqual({ error: "invalid" });
		expect(fake.headers()["set-cookie"]).toBeUndefined();
	});

	test("Cookie-Attrappe öffnet nichts", async ({ page, context, baseURL }) => {
		await context.addCookies([
			{
				name: "klick_portal",
				value: `klk_portal_${"C".repeat(43)}`,
				url: `${baseURL}/lieferant`,
			},
		]);
		await page.goto("/lieferant");
		await expect(
			page.getByRole("heading", {
				name: "Bitte öffne den Link aus der Einladung.",
			}),
		).toBeVisible();
	});
});
