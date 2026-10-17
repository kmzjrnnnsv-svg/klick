import { expect, test } from "@playwright/test";

// CI-Ingest (ADR-017): ohne gültigen Bearer-Token nie 2xx, keine Details —
// auch nicht mit Sitzungs-Cookie-Attrappe oder Token in falscher Form.
test.describe("Ingest-API ohne Token", () => {
	for (const path of ["/api/ingest/scan", "/api/ingest/sbom"]) {
		test(`${path} ohne Token → 401`, async ({ request }) => {
			const res = await request.post(path, { data: "{}" });
			expect(res.status()).toBe(401);
			expect(res.headers()["www-authenticate"]).toBe("Bearer");
			expect(await res.json()).toEqual({ error: "unauthorized" });
		});

		test(`${path} mit falschem Token → 401`, async ({ request }) => {
			const fake = `klk_ingest_${"A".repeat(43)}`;
			const res = await request.post(path, {
				data: "{}",
				headers: { authorization: `Bearer ${fake}`, cookie: "x=1" },
			});
			expect(res.status()).toBe(401);
		});
	}

	test("GET ist nicht vorgesehen", async ({ request }) => {
		const res = await request.get("/api/ingest/scan");
		expect([404, 405]).toContain(res.status());
	});
});
