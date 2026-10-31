import { execFileSync } from "node:child_process";
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

// Build-Stand für Admin > Sicherheit: Commit und Tag des gebauten Stands
// (pnpm release baut nur signierte Tags). Ohne git leer.
const git = (args: string[]) => {
	try {
		return execFileSync("git", args, {
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 5000,
		})
			.toString()
			.trim();
	} catch {
		return "";
	}
};

const nextConfig: NextConfig = {
	poweredByHeader: false,
	env: {
		KLICK_BUILD_COMMIT: git(["rev-parse", "HEAD"]),
		KLICK_BUILD_TAG: git(["describe", "--tags", "--exact-match"]),
		KLICK_BUILD_AT: new Date().toISOString(),
	},
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
		// Uploads laufen als Action mit FormData: Grenze = 25 MB Datei
		// (MAX_UPLOAD_BYTES) + Multipart-Overhead, passend zu nginx
		// client_max_body_size 26m. Ohne den Wert gilt 1 MB — größere Dateien
		// scheiterten vor jedem Guard mit 500.
		serverActions: { allowedOrigins: [appOrigin], bodySizeLimit: "26mb" },
	},
	async headers() {
		return [{ source: "/(.*)", headers: securityHeaders }];
	},
};

export default withNextIntl(nextConfig);
