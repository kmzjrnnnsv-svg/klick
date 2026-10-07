import { describe, expect, it } from "vitest";
import { buildCsp, resolveTenantSlug } from "@/proxy";

describe("resolveTenantSlug", () => {
	it("falls back to DEFAULT_TENANT_SLUG on localhost", () => {
		process.env.DEFAULT_TENANT_SLUG = "default";
		expect(resolveTenantSlug("localhost:3000")).toBe("default");
	});

	it("extracts subdomain from production host", () => {
		expect(resolveTenantSlug("acme.klick.app")).toBe("acme");
	});

	it("falls back when no subdomain is present in production host", () => {
		process.env.DEFAULT_TENANT_SLUG = "default";
		expect(resolveTenantSlug("klick.app")).toBe("default");
	});

	it("respects DEFAULT_TENANT_SLUG env override", () => {
		process.env.DEFAULT_TENANT_SLUG = "tenant-x";
		expect(resolveTenantSlug("localhost")).toBe("tenant-x");
	});
});

describe("buildCsp", () => {
	it("setzt Nonce + strict-dynamic statt unsafe-inline für Skripte", () => {
		const csp = buildCsp("abc123", false);
		expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
		expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
		expect(csp).not.toContain("unsafe-eval");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("upgrade-insecure-requests");
	});
	it("Dev erlaubt unsafe-eval (React Refresh), kein upgrade-insecure-requests", () => {
		const csp = buildCsp("n", true);
		expect(csp).toContain("'unsafe-eval'");
		expect(csp).not.toContain("upgrade-insecure-requests");
	});
});
