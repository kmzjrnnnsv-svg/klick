import { expect, test } from "@playwright/test";

// Ohne Sitzung: jede App-Seite führt zum Login, jede API antwortet 401 —
// nie Inhalte, nie ein Existenz-Orakel über fremde IDs.
const APP_ROUTES = [
	"/heute",
	"/ueberblick",
	"/controls",
	"/synergien",
	"/risiken",
	"/dokumente",
	"/prozesse",
	"/organisation",
	"/aml",
	"/eigenmittel",
	"/kryptowerte",
	"/antrag",
	"/roadmap",
	"/suche?q=test",
	"/kalender",
	"/einstellungen",
	"/admin",
];

test.describe("Anonym", () => {
	for (const route of APP_ROUTES) {
		test(`${route} → /login`, async ({ page }) => {
			const res = await page.goto(route);
			expect(res?.status()).toBeLessThan(400);
			await expect(page).toHaveURL(/\/login(\?|$)/);
		});
	}

	test("Exporte und Nachweise verweigern ohne Sitzung", async ({ request }) => {
		for (const url of [
			"/api/export/gap.csv",
			"/api/export/soa.md",
			"/api/export/risiken.csv",
			"/api/export/antrag.md?mappe=micar",
		]) {
			const res = await request.get(url, { maxRedirects: 0 });
			expect([401, 302, 307]).toContain(res.status());
			expect(res.headers()["content-type"] ?? "").not.toContain("text/csv");
		}
		const evidence = await request.get(
			"/api/nachweise/00000000-0000-4000-8000-000000000000",
			{ maxRedirects: 0 },
		);
		expect([401, 302, 307, 404]).toContain(evidence.status());
	});

	test("Fremde IDs liefern kein Orakel (Admin-Audit-Export)", async ({
		request,
	}) => {
		const res = await request.get(
			"/api/admin/audit.csv?org=00000000-0000-4000-8000-000000000000",
			{
				maxRedirects: 0,
			},
		);
		expect([401, 302, 307]).toContain(res.status());
	});
});
