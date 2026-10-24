"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

// Aktiv ist nur der spezifischste Eintrag ("/" nur exakt)
export function activeHref(
	items: readonly NavItem[],
	path: string,
): string | null {
	const hits = items
		.filter((i) =>
			i.href === "/"
				? path === "/"
				: path === i.href || path.startsWith(`${i.href}/`),
		)
		.sort((a, b) => b.href.length - a.href.length);
	return hits[0]?.href ?? null;
}

export function NavLinks({
	items,
	label,
}: {
	items: NavItem[];
	label: string;
}) {
	const path = usePathname();
	const active = activeHref(items, path);
	return (
		<nav aria-label={label}>
			<ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
				{items.map((i) => (
					<li key={i.href}>
						<Link
							href={i.href}
							aria-current={i.href === active ? "page" : undefined}
							className={cn(
								"block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
								i.href === active && "bg-muted font-medium text-primary",
							)}
						>
							{i.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
