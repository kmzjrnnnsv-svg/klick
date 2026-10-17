"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

// Ruhigere Navigation: diese Gruppen sind einklappbar; offen ist die Gruppe
// der aktuellen Seite plus was die Person selbst aufgeklappt hat
// (localStorage, nur Komfort). Links bleiben im DOM (hidden).
const COLLAPSIBLE = new Set([
	"groupRegisters",
	"groupGovernance",
	"groupCasp",
	"groupFrameworks",
]);
const OPEN_KEY = "klick.nav.open";

export function SidebarNav({
	groups,
	onNavigate,
}: {
	groups: NavGroup[];
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	const pathname = usePathname();
	const [opened, setOpened] = useState<Record<string, boolean>>({});
	useEffect(() => {
		try {
			setOpened(JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}"));
		} catch {
			// kein Speicher → Standard
		}
	}, []);
	const toggle = (key: string, next: boolean) => {
		const value = { ...opened, [key]: next };
		setOpened(value);
		try {
			window.localStorage.setItem(OPEN_KEY, JSON.stringify(value));
		} catch {
			// egal
		}
	};
	const isActive = (href: string) =>
		pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

	return (
		<nav aria-label="Hauptnavigation" className="flex flex-col gap-5 text-sm">
			{groups.map((group) => {
				const collapsible = Boolean(
					group.labelKey && COLLAPSIBLE.has(group.labelKey),
				);
				const hasActive = group.items.some((i) => isActive(i.href));
				const open = !collapsible || hasActive || Boolean(opened[group.key]);
				const listId = `nav-${group.key}`;
				return (
					<div key={group.key} className="flex flex-col gap-0.5">
						{group.labelKey &&
							(collapsible ? (
								<button
									type="button"
									aria-expanded={open}
									aria-controls={listId}
									disabled={hasActive}
									onClick={() => toggle(group.key, !open)}
									className="lv-eyebrow mb-1 flex items-center gap-1 rounded-sm px-2 text-left text-[0.58rem] text-muted-foreground hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
								>
									<ChevronRight
										className={cn(
											"size-3 transition-transform motion-reduce:transition-none",
											open && "rotate-90",
										)}
										aria-hidden="true"
									/>
									{t(group.labelKey)}
									{!open && (
										<span className="ml-auto font-normal normal-case tracking-normal">
											{group.items.length}
										</span>
									)}
								</button>
							) : (
								<p className="lv-eyebrow mb-1 px-2 text-[0.58rem] text-muted-foreground">
									{t(group.labelKey)}
								</p>
							))}
						<div id={listId} hidden={!open} className="flex flex-col gap-0.5">
							{group.items.map((item) => {
								const label =
									item.label ?? (item.labelKey ? t(item.labelKey) : item.key);
								const active = isActive(item.href);
								if (item.phase) {
									return (
										<Tooltip key={item.key}>
											<TooltipTrigger asChild>
												<span
													aria-disabled="true"
													className="flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 text-muted-foreground/60"
												>
													<NavIcon
														name={item.icon}
														className="size-4 shrink-0"
													/>
													<span className="truncate">{label}</span>
													<span className="ml-auto text-[0.58rem] tracking-[0.12em]">
														{item.phase}
													</span>
												</span>
											</TooltipTrigger>
											<TooltipContent side="right">
												{t("comingSoon")}
											</TooltipContent>
										</Tooltip>
									);
								}
								return (
									<Link
										key={item.key}
										href={item.href}
										onClick={onNavigate}
										aria-current={active ? "page" : undefined}
										className={cn(
											"flex h-8 items-center gap-2.5 rounded-sm px-2 text-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground",
											active && "bg-sidebar-accent font-medium text-foreground",
										)}
									>
										<NavIcon name={item.icon} className="size-4 shrink-0" />
										<span className="truncate">{label}</span>
										{item.count ? (
											<Badge
												variant="default"
												className="ml-auto px-1.5 py-0 text-[0.58rem]"
											>
												{item.count}
											</Badge>
										) : null}
									</Link>
								);
							})}
						</div>
					</div>
				);
			})}
		</nav>
	);
}
