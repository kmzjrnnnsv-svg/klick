import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Proxy (Next 16; ehemals middleware): zwei Aufgaben.
//   1. Tenant-Subdomain → x-org-slug (nur Branding/Pre-Select, nie Autorisierung).
//   2. Nonce-CSP je Request: script-src 'nonce-…' 'strict-dynamic' statt
//      'unsafe-inline'. Next liest den Nonce aus dem CSP-Request-Header und
//      setzt ihn auf Framework-Skripte; next-themes bekommt ihn als Prop.
// Die übrigen Security-Header kommen weiterhin aus next.config.ts.

export function resolveTenantSlug(host: string): string {
	const hostname = host.split(":")[0] ?? "";
	const fallback = process.env.DEFAULT_TENANT_SLUG ?? "default";
	const isLocal =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname.endsWith(".localhost");
	if (isLocal) return fallback;
	const parts = hostname.split(".");
	return parts.length > 2 ? (parts[0] ?? fallback) : fallback;
}

export function buildCsp(nonce: string, isDev: boolean): string {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
		// Tailwind/Next-Inline-Styles brauchen 'unsafe-inline' (kein Style-Nonce in RSC-Streams).
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		"connect-src 'self'",
		"frame-src 'self'",
		"frame-ancestors 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		...(isDev ? [] : ["upgrade-insecure-requests"]),
	].join("; ");
}

export function proxy(request: NextRequest) {
	const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
	const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	requestHeaders.set("Content-Security-Policy", csp);
	requestHeaders.set(
		"x-org-slug",
		resolveTenantSlug(request.headers.get("host") ?? ""),
	);

	const response = NextResponse.next({ request: { headers: requestHeaders } });
	response.headers.set("Content-Security-Policy", csp);
	return response;
}

export const config = {
	matcher: [
		{
			// Alles ausser Next-Interna, Bildoptimierung und statischen Dateien;
			// Prefetches brauchen keine neue Policy.
			source: "/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
