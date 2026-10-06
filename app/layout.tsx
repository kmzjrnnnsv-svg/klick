import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Jost } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
		title: { default: t("title"), template: "%s · Klick" },
		description: t("description"),
		applicationName: "Klick",
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
	const locale = await getLocale();
	const messages = await getMessages();
	return (
		<html
			lang={locale}
			suppressHydrationWarning
			className={`${jost.variable} ${cormorant.variable} ${jetbrainsMono.variable} h-full antialiased`}
		>
			<body className="flex min-h-full flex-col bg-background text-foreground">
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<NextIntlClientProvider
						messages={messages}
						locale={locale}
						timeZone="Europe/Berlin"
					>
						<TooltipProvider>{children}</TooltipProvider>
						<Toaster />
					</NextIntlClientProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
