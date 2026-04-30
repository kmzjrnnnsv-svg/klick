import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Pure helper, exported for tests.
export function resolveTenantSlug(host: string): string {
	const hostname = host.split(":")[0];
	const fallback = process.env.DEFAULT_TENANT_SLUG ?? "default";

	const isLocal =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname.endsWith(".localhost");
	if (isLocal) return fallback;

	const parts = hostname.split(".");
	// e.g. acme.klick.app → ["acme", "klick", "app"] → "acme"
	return parts.length > 2 ? parts[0] : fallback;
}

// Tenant subdomain resolver.
// Local dev: no subdomain → default tenant slug from env.
// Production: `acme.klick.app` → tenantSlug = "acme".
// The slug is forwarded as `x-tenant-slug` request header so server components
// and route handlers can resolve the tenant row from the DB.
export function proxy(request: NextRequest) {
	const tenantSlug = resolveTenantSlug(request.headers.get("host") ?? "");
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-tenant-slug", tenantSlug);
	return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
	// Skip static assets and Next internals.
	matcher: ["/((?!_next|favicon\\.ico|.*\\..*).*)"],
};
