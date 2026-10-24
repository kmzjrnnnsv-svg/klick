import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// both.money (apps/wallet): eigene Next-App im Repo von Klick. Geteilte,
// reine Bausteine liegen an der Repo-Wurzel (lib/wallet, components/ui …),
// deshalb ist die Wurzel zugleich Turbopack- und Tracing-Root.
const REPO_ROOT = path.resolve(__dirname, "../..");

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// CSP kommt je Request mit Nonce aus proxy.ts; hier nur die statischen Header.
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
		return new URL(process.env.WALLET_AUTH_URL ?? "http://localhost:3400").host;
	} catch {
		return "localhost:3400";
	}
})();

const nextConfig: NextConfig = {
	poweredByHeader: false,
	turbopack: { root: REPO_ROOT },
	outputFileTracingRoot: REPO_ROOT,
	serverExternalPackages: [
		"postgres",
		"pg-boss",
		"pino",
		"pino-pretty",
		"libsodium-wrappers",
	],
	images: { remotePatterns: [] },
	experimental: {
		// Server Actions nur vom eigenen Origin (CSRF); keine Uploads
		serverActions: { allowedOrigins: [appOrigin], bodySizeLimit: "1mb" },
	},
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }];
	},
};

export default withNextIntl(nextConfig);
