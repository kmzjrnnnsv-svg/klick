"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SourceGroup } from "@/components/ui/source-group";
import { SourceItem, SourceItems } from "@/components/ui/source-list";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { activeNavKey, type NavGroup } from "@/lib/nav";
import { NavIcon } from "./nav-icon";

// Seitenleiste nach Apple HIG: zwei Ebenen (Gruppe > Seite), Gruppen
// einklappbar (SourceGroup: der Zustand bleibt beim Navigieren erhalten, weil
// das Layout nicht neu montiert, und steht im Browser, damit er auch nach
// dem Neuladen gilt — die Gruppe mit der offenen Seite bleibt immer auf),
// Symbole in Akzentfarbe, Auswahl getönt, Zähler als graue Zahl. Zeilen und
// Gruppen sind dieselben Bausteine wie in both.money und in den Listen neben
// dem Inhalt (components/ui/source-list.tsx).
const CLOSED_KEY = "klick.nav.closed";

export function SidebarNav({
	groups,
	onNavigate,
}: {
	groups: NavGroup[];
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	const pathname = usePathname();
	const search = useSearchParams();
	const activeKey = activeNavKey(groups, pathname, search.toString());

	return (
		<nav
			aria-label="Hauptnavigation"
			className="flex flex-col gap-4 text-subhead"
		>
			{groups.map((group) => {
				const items = group.items.map((item) => {
					const label =
						item.label ?? (item.labelKey ? t(item.labelKey) : item.key);
					if (item.phase) {
						return (
							<li key={item.key}>
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											aria-disabled="true"
											className="flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-muted-foreground pointer-coarse:h-11"
										>
											<NavIcon
												name={item.icon}
												className="size-[1.125rem] shrink-0"
											/>
											<span className="truncate">{label}</span>
											<span className="ml-auto text-footnote">
												{item.phase}
											</span>
										</span>
									</TooltipTrigger>
									<TooltipContent side="right">
										{t("comingSoon")}
									</TooltipContent>
								</Tooltip>
							</li>
						);
					}
					return (
						<SourceItem
							key={item.key}
							href={item.href}
							onClick={onNavigate}
							current={item.key === activeKey}
							icon={<NavIcon name={item.icon} />}
							title={label}
							truncate
							trailing={item.count || undefined}
						/>
					);
				});
				if (!group.labelKey)
					return <SourceItems key={group.key}>{items}</SourceItems>;
				return (
					<SourceGroup
						key={group.key}
						id={group.key}
						title={t(group.labelKey)}
						active={group.items.some((i) => i.key === activeKey)}
						storageKey={CLOSED_KEY}
					>
						{items}
					</SourceGroup>
				);
			})}
		</nav>
	);
}
