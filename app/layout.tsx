import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Jost } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
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
		title: t("title"),
		description: t("description"),
		manifest: "/manifest.json",
		applicationName: "Klick",
		appleWebApp: {
			capable: true,
			title: "Klick",
			statusBarStyle: "default",
		},
		formatDetection: { telephone: false },
		other: {
			"mobile-web-app-capable": "yes",
		},
	};
}

export const viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover" as const,
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const messages = await getMessages();
	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={`${jost.variable} ${cormorant.variable} ${jetbrainsMono.variable} h-full antialiased`}
		>
			<body className="bg-background text-foreground min-h-full flex flex-col">
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<NextIntlClientProvider messages={messages} locale={locale}>
						{children}
					</NextIntlClientProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
