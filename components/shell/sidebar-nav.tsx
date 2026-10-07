"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export function SidebarNav({
	groups,
	onNavigate,
}: {
	groups: NavGroup[];
	onNavigate?: () => void;
}) {
	const t = useTranslations("Nav");
	const pathname = usePathname();

	return (
		<nav aria-label="Hauptnavigation" className="flex flex-col gap-5 text-sm">
			{groups.map((group) => (
				<div key={group.key} className="flex flex-col gap-0.5">
					{group.labelKey && (
						<p className="lv-eyebrow mb-1 px-2 text-[0.58rem] text-muted-foreground">
							{t(group.labelKey)}
						</p>
					)}
					{group.items.map((item) => {
						const label =
							item.label ?? (item.labelKey ? t(item.labelKey) : item.key);
						const active =
							pathname === item.href ||
							(item.href !== "/" && pathname.startsWith(`${item.href}/`));
						if (item.phase) {
							return (
								<Tooltip key={item.key}>
									<TooltipTrigger asChild>
										<span
											aria-disabled="true"
											className="flex h-8 cursor-default items-center gap-2.5 rounded-sm px-2 text-muted-foreground/60"
										>
											<NavIcon name={item.icon} className="size-4 shrink-0" />
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
			))}
		</nav>
	);
}
