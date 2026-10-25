"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { activeNavKey, type NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

// Seitenleiste nach Apple HIG: zwei Ebenen (Gruppe → Seite), Gruppen
// einklappbar (<details>, der Zustand bleibt beim Navigieren erhalten, weil
// das Layout nicht neu montiert), Symbole in Akzentfarbe, Auswahl getönt,
// Zähler als graue Zahl.
export function SidebarNav({
	groups,
	onNavigate,
}: {
	groups: NavGroup[];
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	const pathname = usePathname();
	const activeKey = activeNavKey(groups, pathname);

	return (
		<nav
			aria-label="Hauptnavigation"
			className="flex flex-col gap-4 text-subhead"
		>
			{groups.map((group) => {
				const items = (
					<ul className="flex flex-col gap-px">
						{group.items.map((item) => {
							const label =
								item.label ?? (item.labelKey ? t(item.labelKey) : item.key);
							const active = item.key === activeKey;
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
								<li key={item.key}>
									<Link
										href={item.href}
										onClick={onNavigate}
										aria-current={active ? "page" : undefined}
										className={cn(
											"flex h-8 items-center gap-2.5 rounded-md px-2 text-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11",
											active &&
												"bg-primary/12 font-semibold hover:bg-primary/12 dark:bg-primary/20",
										)}
									>
										<NavIcon
											name={item.icon}
											className="size-[1.125rem] shrink-0 text-primary"
										/>
										<span className="truncate">{label}</span>
										{item.count ? (
											<span className="tabular ml-auto font-normal text-footnote text-muted-foreground">
												{item.count}
											</span>
										) : null}
									</Link>
								</li>
							);
						})}
					</ul>
				);
				if (!group.labelKey) return <div key={group.key}>{items}</div>;
				return (
					<details key={group.key} open className="group/nav">
						<summary className="mb-0.5 flex h-7 cursor-default list-none pointer-coarse:h-11 items-center justify-between rounded-md px-2 font-semibold text-footnote text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
							{t(group.labelKey)}
							<ChevronDown
								aria-hidden="true"
								className="size-3.5 -rotate-90 transition-transform group-open/nav:rotate-0"
							/>
						</summary>
						{items}
					</details>
				);
			})}
		</nav>
	);
}
