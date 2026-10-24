"use client";

import {
	activeWalletNav,
	activeWalletTab,
	type WalletNavGroup,
	walletTabs,
} from "@wallet/lib/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

// Seitenleiste ab 1024 px nach Apple HIG: Gruppen, Symbole in Akzentfarbe,
// Auswahl getönt. Zuordnung pure in lib/nav.ts.
export function SidebarLinks({ groups }: { groups: WalletNavGroup[] }) {
	const t = useTranslations("Shell");
	const path = usePathname();
	const active = activeWalletNav(groups, path);
	return (
		<nav aria-label={t("nav")} className="flex flex-col gap-4 text-subhead">
			{groups.map((g) => (
				<div key={g.key} className="flex flex-col gap-0.5">
					{g.labelKey && (
						<p className="px-2 pb-0.5 font-semibold text-footnote text-muted-foreground">
							{t(g.labelKey)}
						</p>
					)}
					<ul className="flex flex-col gap-px">
						{g.items.map((i) => {
							const on = i.key === active;
							return (
								<li key={i.key}>
									<Link
										href={i.href}
										aria-current={on ? "page" : undefined}
										className={cn(
											"flex h-8 items-center gap-2.5 rounded-md px-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											on &&
												"bg-primary/12 font-semibold hover:bg-primary/12 dark:bg-primary/20",
										)}
									>
										<NavIcon
											name={i.icon}
											className="size-[1.125rem] shrink-0 text-primary"
										/>
										<span className="truncate">{t(i.labelKey)}</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</nav>
	);
}

// Tab-Leiste unter 1024 px: fest unten, Material, Safe Area, fünf Tabs
export function TabBar({ send }: { send: boolean }) {
	const t = useTranslations("Shell");
	const path = usePathname();
	const active = activeWalletTab(send, path);
	return (
		<nav
			data-tab-bar
			aria-label={t("tabBar")}
			className="material-bar fixed inset-x-0 bottom-0 z-40 border-border/60 border-t pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] lg:hidden"
		>
			<ul className="mx-auto flex max-w-xl">
				{walletTabs(send).map((tab) => {
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
