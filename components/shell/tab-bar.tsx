"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeNavTab, type NavGroup, navTabs } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

// Tab-Leiste am Handy nach Apple HIG (unter 1024 px): fest unten, Material,
// Safe Area, höchstens fünf Tabs, nur Navigation. Zuordnung pure in
// lib/nav.ts (navTabs, activeNavTab).
export function TabBar({ groups }: { groups: NavGroup[] }) {
	const t = useTranslations("Nav");
	const pathname = usePathname();
	const tabs = navTabs(groups);
	if (tabs.length === 0) return null;
	const active = activeNavTab(groups, pathname);
	return (
		<nav
			data-tab-bar
			aria-label={t("tabBar")}
			className="material-bar fixed inset-x-0 bottom-0 z-40 border-border/60 border-t pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] lg:hidden"
		>
			<ul className="mx-auto flex max-w-xl">
				{tabs.map((tab) => {
					const on = tab.key === active;
					return (
						<li key={tab.key} className="min-w-0 flex-1">
							<Link
								href={tab.href}
								aria-current={on ? "page" : undefined}
								className={cn(
									"flex h-[3.0625rem] flex-col items-center justify-center gap-0.5 font-medium text-caption-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
									on
										? "text-primary"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<NavIcon
									name={tab.icon}
									className={cn("size-6", on && "[stroke-width:2.25]")}
								/>
								<span className="max-w-full truncate px-0.5 tracking-tight">
									{t(tab.labelKey)}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
