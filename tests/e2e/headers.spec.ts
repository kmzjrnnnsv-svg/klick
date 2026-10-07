import { expect, test } from "@playwright/test";

// Härtung: Security-Header auf jeder Antwort, CSP mit Nonce + strict-dynamic
// (proxy.ts), kein unsafe-inline für Skripte.
test.describe("Security-Header", () => {
	test("Landing liefert vollständigen Header-Satz", async ({ request }) => {
		const res = await request.get("/");
		expect(res.status()).toBe(200);
		const h = res.headers();
		expect(h["x-frame-options"]).toBe("DENY");
		expect(h["x-content-type-options"]).toBe("nosniff");
		expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(h["permissions-policy"]).toBeTruthy();
		expect(h["cross-origin-opener-policy"]).toBe("same-origin");
		expect(h["x-powered-by"]).toBeUndefined();
		const csp = h["content-security-policy"] ?? "";
		expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
		expect(csp).toContain("'strict-dynamic'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
	});

	test("Nonce wechselt je Request", async ({ request }) => {
		const a =
			(await request.get("/")).headers()["content-security-policy"] ?? "";
		const b =
			(await request.get("/")).headers()["content-security-policy"] ?? "";
		const nonce = (csp: string) => csp.match(/'nonce-([^']+)'/)?.[1];
		expect(nonce(a)).toBeTruthy();
		expect(nonce(a)).not.toBe(nonce(b));
	});

	test("Öffentliche Seiten /preise und /vertrauen liefern 200 und das Paket", async ({
		request,
	}) => {
		for (const path of ["/preise", "/vertrauen"]) {
			const res = await request.get(path);
			expect(res.status(), path).toBe(200);
			expect(res.headers()["x-frame-options"]).toBe("DENY");
		}
		const pack = await request.get("/vertrauen/paket.md");
		expect(pack.status()).toBe(200);
		expect(pack.headers()["content-type"]).toContain("text/markdown");
		expect(await pack.text()).toContain("Lieferantenpaket der Plattform");
	});

	test("Health und Readiness antworten", async ({ request }) => {
		expect((await request.get("/api/health")).status()).toBe(200);
		const ready = await request.get("/api/ready");
		expect([200, 503]).toContain(ready.status());
		expect(ready.headers()["cache-control"]).toContain("no-store");
	});
});
