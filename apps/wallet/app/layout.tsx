import { LegalFooter } from "@wallet/components/legal/footer";
import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Jost } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jost = Jost({
	variable: "--font-sans-display",
	subsets: ["latin"],
	display: "swap",
	weight: ["300", "400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
	variable: "--font-serif-display",
	subsets: ["latin"],
	display: "swap",
	weight: ["400", "500", "600", "700"],
	style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
	display: "swap",
});

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
		{ media: "(prefers-color-scheme: light)", color: "#f8f6f0" },
		{ media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
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
		<html
			lang={locale}
			className={`${jost.variable} ${cormorant.variable} ${jetbrainsMono.variable} h-full antialiased`}
		>
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
