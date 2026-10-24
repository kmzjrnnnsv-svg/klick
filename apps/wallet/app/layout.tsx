import { LegalFooter } from "@wallet/components/legal/footer";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Meta");
	return {
		title: { default: t("title"), template: "%s · both.money" },
		description: t("description"),
		applicationName: "both.money",
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
	// Jede Seite dynamisch: Next setzt den Nonce aus proxy.ts nur beim Rendern
	// je Request an die Skripte (CSP mit 'strict-dynamic').
	await headers();
	const locale = await getLocale();
	const messages = await getMessages();
	return (
		<html lang={locale} className="h-full antialiased">
			<body className="flex min-h-full flex-col bg-background text-foreground">
				<NextIntlClientProvider locale={locale} messages={messages}>
					{children}
					<LegalFooter />
					<Toaster />
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
