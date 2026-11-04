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
import { SourceGroup } from "@/components/ui/source-group";
import { SourceItem, SourceItems } from "@/components/ui/source-list";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

// Seitenleiste ab 1024 px nach Apple HIG — dieselben Bausteine wie das Menü
// von Klick (components/ui/source-list.tsx, source-group.tsx): Gruppen
// einklappbar (Zustand im Browser, die Gruppe der offenen Seite bleibt auf),
// Symbole in Akzentfarbe, Auswahl getönt. Zuordnung pure in lib/nav.ts.
const CLOSED_KEY = "both.nav.closed";

export function SidebarLinks({ groups }: { groups: WalletNavGroup[] }) {
	const t = useTranslations("Shell");
	const path = usePathname();
	const active = activeWalletNav(groups, path);
	return (
		<nav aria-label={t("nav")} className="flex flex-col gap-4 text-subhead">
			{groups.map((g) => {
				const items = g.items.map((i) => (
					<SourceItem
						key={i.key}
						href={i.href}
						current={i.key === active}
						icon={<NavIcon name={i.icon} />}
						title={t(i.labelKey)}
						truncate
					/>
				));
				if (!g.labelKey) return <SourceItems key={g.key}>{items}</SourceItems>;
				return (
					<SourceGroup
						key={g.key}
						id={g.key}
						title={t(g.labelKey)}
						active={g.items.some((i) => i.key === active)}
						storageKey={CLOSED_KEY}
					>
						{items}
					</SourceGroup>
				);
			})}
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
