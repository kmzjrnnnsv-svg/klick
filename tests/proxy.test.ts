import { describe, expect, it } from "vitest";
import { resolveTenantSlug } from "@/proxy";

describe("resolveTenantSlug", () => {
	it("falls back to DEFAULT_TENANT_SLUG on localhost", () => {
		process.env.DEFAULT_TENANT_SLUG = "default";
		expect(resolveTenantSlug("localhost:3000")).toBe("default");
	});

	it("extracts subdomain from production host", () => {
		expect(resolveTenantSlug("acme.trustvault.eu")).toBe("acme");
	});

	it("falls back when no subdomain is present in production host", () => {
		process.env.DEFAULT_TENANT_SLUG = "default";
		expect(resolveTenantSlug("trustvault.eu")).toBe("default");
	});

	it("respects DEFAULT_TENANT_SLUG env override", () => {
		process.env.DEFAULT_TENANT_SLUG = "tenant-x";
		expect(resolveTenantSlug("localhost")).toBe("tenant-x");
	});
});
