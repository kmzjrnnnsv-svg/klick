import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";

// Geführte Einrichtung (D0): ruhiges Layout ohne Sidebar, breiter als die
// Anmeldeseiten. Sitzung je Request — nie statisch vorrendern.
export const dynamic = "force-dynamic";

export default async function SetupLayout({
	children,
}: {
	children: ReactNode;
}) {
	const t = await getTranslations("Common");
	return (
		<>
			<header className="sticky top-0 z-30 w-full border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
					<Link
						href="/heute"
						className="lv-wordmark text-[0.95rem] text-foreground hover:opacity-70"
					>
						{t("productName")}
					</Link>
					<ThemeSwitcher />
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-4xl grow flex-col px-4 py-8 sm:px-6 sm:py-10">
				{children}
			</main>
		</>
	);
}
