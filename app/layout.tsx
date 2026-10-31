import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Meta");
	return {
		title: { default: t("title"), template: "%s · Klick" },
		description: t("description"),
		applicationName: "Klick",
		// Web-App-Manifest: auf dem iPhone Push nur als Web-App vom Home-Bildschirm
		manifest: "/manifest.json",
		appleWebApp: { capable: true, title: "Klick", statusBarStyle: "default" },
		robots: { index: false, follow: false },
		formatDetection: { telephone: false },
	};
}

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
		{ media: "(prefers-color-scheme: dark)", color: "#000000" },
	],
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const messages = await getMessages();
	const t = await getTranslations("Common");
	// Jede Seite dynamisch: Next setzt den Nonce aus proxy.ts nur beim Rendern
	// je Request an die Skripte (CSP mit 'strict-dynamic').
	await headers();
	return (
		<html lang={locale} className="h-full antialiased">
			<body className="flex min-h-full flex-col bg-background text-foreground">
				{/* Jedes Layout setzt id="inhalt" auf seinen Hauptbereich */}
				<a
					href="#inhalt"
					className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-subhead focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
				>
					{t("skipToContent")}
				</a>
				<NextIntlClientProvider
					messages={messages}
					locale={locale}
					timeZone="Europe/Berlin"
				>
					<TooltipProvider>{children}</TooltipProvider>
					<Toaster />
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
