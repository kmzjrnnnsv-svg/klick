import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// CSP kommt je Request mit Nonce aus proxy.ts (script-src 'nonce-…'
// 'strict-dynamic'); hier nur die statischen Header.
const securityHeaders = [
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
		// Uploads (Nachweise, Gap-Analyse, Scan-Import) laufen als Server-Action
		// mit FormData: 25 MB (lib/uploads/types.ts) + Multipart-Overhead. Ohne
		// das greift Nexts 1-MB-Default und der Upload endet auf der Fehlerseite.
		serverActions: { allowedOrigins: [appOrigin], bodySizeLimit: "27mb" },
		// proxy.ts puffert Request-Bodies (Default 10 MB, darüber abgeschnitten).
		proxyClientMaxBodySize: "27mb",
	},
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }];
	},
};

export default withNextIntl(nextConfig);
