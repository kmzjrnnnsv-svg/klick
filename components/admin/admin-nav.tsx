"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminTab = { href: string; label: string };

// Reiter des Admin-Bereichs: am Desktop im Kopf, am Handy als waagrecht
// scrollende Kapseln. Die aktuelle Seite ist markiert (aria-current).
export function AdminNav({
	tabs,
	variant,
}: {
	tabs: AdminTab[];
	variant: "bar" | "chips";
}) {
	const path = usePathname();
	const active = (href: string) =>
		href === "/admin" ? path === "/admin" : path.startsWith(href);
	if (variant === "bar")
		return (
			<nav className="ml-4 hidden gap-4 md:flex">
				{tabs.map((tab) => (
					<Link
						key={tab.href}
						href={tab.href}
						aria-current={active(tab.href) ? "page" : undefined}
						className="font-medium text-muted-foreground text-subhead hover:text-foreground aria-[current=page]:text-foreground"
					>
						{tab.label}
					</Link>
				))}
			</nav>
		);
	return (
		<nav className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:hidden">
			{tabs.map((tab) => (
				<Link
					key={tab.href}
					href={tab.href}
					aria-current={active(tab.href) ? "page" : undefined}
					className={cn(
						"inline-flex h-(--control-h-sm) shrink-0 items-center rounded-full bg-muted px-3 font-medium text-footnote",
						"aria-[current=page]:bg-primary-fill aria-[current=page]:text-white",
					)}
				>
					{tab.label}
				</Link>
			))}
		</nav>
	);
}
