import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { gateAdmin } from "@/lib/auth/gates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	await gateAdmin();
	const t = await getTranslations("Admin");
	const tabs = [
		{ href: "/admin", label: t("title") },
		{ href: "/admin/orgs", label: t("orgs") },
		{ href: "/admin/users", label: t("users") },
		{ href: "/admin/audit", label: t("audit") },
		{ href: "/admin/cms", label: t("cms") },
	];
	return (
		<>
			<header className="sticky top-0 z-30 border-border/60 border-b bg-background/85 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
					<Link href="/heute" className="lv-wordmark text-[0.8rem]">
						Klick
					</Link>
					<span className="lv-eyebrow text-[0.56rem] text-brown">
						{t("title")}
					</span>
					<nav className="ml-4 hidden gap-4 md:flex">
						{tabs.map((tab) => (
							<Link
								key={tab.href}
								href={tab.href}
								className="lv-nav text-[0.66rem] text-muted-foreground hover:text-foreground"
							>
								{tab.label}
							</Link>
						))}
					</nav>
					<div className="ml-auto flex items-center gap-1">
						<ThemeSwitcher />
						<Link
							href="/heute"
							className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
						>
							Zur App
						</Link>
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
				<p className="mb-6 text-muted-foreground text-sm">{t("lead")}</p>
				{children}
			</main>
		</>
	);
}
