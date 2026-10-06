import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV === "development";

// P0-CSP. 'unsafe-inline' für Skripte ist dem next-themes-Inline-Script
// geschuldet und wird in P1 durch einen Request-Nonce in proxy.ts ersetzt.
// Styles brauchen 'unsafe-inline' (Tailwind/Next-Inline-Styles). Alles andere
// ist strikt: keine fremden Origins, keine Frames von außen, keine Plugins.
const csp = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"font-src 'self'",
	"connect-src 'self'",
	// PDF-Inline-Vorschau (P2) kommt aus eigener, sandboxed Response.
	"frame-src 'self'",
	"frame-ancestors 'none'",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
	{ key: "Content-Security-Policy", value: csp },
	{
		key: "Strict-Transport-Security",
		value: "max-age=63072000; includeSubDomains; preload",
	},
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value:
			"camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()",
	},
	{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
	{ key: "Cross-Origin-Resource-Policy", value: "same-origin" },
	{ key: "X-DNS-Prefetch-Control", value: "off" },
];

const appOrigin = (() => {
	try {
		return new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host;
	} catch {
		return "localhost:3000";
	}
})();

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// Node-only Pakete nicht bundeln (native Bindings, Worker-Threads).
	serverExternalPackages: [
		"postgres",
		"pg-boss",
		"pino",
		"pino-pretty",
		"libsodium-wrappers",
	],
	// Keine externen Bilder — CSP img-src ist 'self' data: blob:.
	images: { remotePatterns: [] },
	experimental: {
		// Server Actions akzeptieren nur Aufrufe vom eigenen Origin (CSRF).
		serverActions: { allowedOrigins: [appOrigin] },
	},
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }];
	},
};

export default withNextIntl(nextConfig);
