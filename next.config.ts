import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
	// Allow Drizzle's pg client (Node-only) on the server side.
	serverExternalPackages: ["postgres"],
};

export default withNextIntl(nextConfig);
