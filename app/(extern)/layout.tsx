import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";

// Externe Zugänge ohne Konto (Lieferantenportal, ADR-017): kein AppShell,
// keine Navigation in die App, nie statisch vorrendern.
export const dynamic = "force-dynamic";

export default async function ExternLayout({
	children,
}: {
	children: ReactNode;
}) {
	const t = await getTranslations("Common");
	return (
		<>
			<header className="w-full border-border/60 border-b bg-background">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
					<span className="lv-wordmark text-[0.95rem] text-foreground">
						{t("productName")}
					</span>
					<ThemeSwitcher />
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-3xl grow flex-col px-4 py-8 sm:px-6">
				{children}
			</main>
		</>
	);
}
