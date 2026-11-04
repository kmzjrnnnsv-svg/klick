"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/nav-icon";
import {
	SourceItem,
	SourceList,
	SourceSection,
} from "@/components/ui/source-list";
import type { NavIcon as NavIconName } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type AdminNavEntry = { href: string; label: string; icon: NavIconName };
export type AdminNavSection = { label: string; items: AdminNavEntry[] };

// Aktiver Eintrag: längster passender Pfad, `/admin` nur exakt (gleiche
// Regel wie activeAdminHref in lib/admin/nav.ts, hier ohne Import, damit die
// Client-Datei klein bleibt).
function activeHref(path: string, sections: AdminNavSection[]) {
	let best: string | null = null;
	for (const s of sections)
		for (const item of s.items) {
			const hit =
				item.href === "/admin"
					? path === "/admin"
					: path === item.href || path.startsWith(`${item.href}/`);
			if (hit && (!best || item.href.length > best.length)) best = item.href;
		}
	return best;
}

// Seitenleiste des Admin-Bereichs nach Apple HIG — dieselben Bausteine wie
// das Menü der App (components/ui/source-list.tsx). Am Handy dieselben Seiten als
// waagrecht scrollende Kapseln.
export function AdminNav({
	sections,
	variant,
}: {
	sections: AdminNavSection[];
	variant: "sidebar" | "chips";
}) {
	const path = usePathname();
	const active = activeHref(path, sections);
	if (variant === "sidebar")
		return (
			<nav aria-label="Admin-Navigation">
				<SourceList>
					{sections.map((s) => (
						<SourceSection key={s.label} title={s.label}>
							{s.items.map((item) => (
								<SourceItem
									key={item.href}
									href={item.href}
									current={item.href === active}
									icon={<NavIcon name={item.icon} />}
									title={item.label}
									truncate
								/>
							))}
						</SourceSection>
					))}
				</SourceList>
			</nav>
		);
	return (
		<nav
			aria-label="Admin-Navigation"
			className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:hidden"
		>
			{sections
				.flatMap((s) => s.items)
				.map((item) => (
					<Link
						key={item.href}
						href={item.href}
						aria-current={item.href === active ? "page" : undefined}
						className={cn(
							"inline-flex h-(--control-h-sm) shrink-0 items-center rounded-full bg-muted px-3 font-medium text-footnote",
							"aria-[current=page]:bg-primary-fill aria-[current=page]:text-white",
						)}
					>
						{item.label}
					</Link>
				))}
		</nav>
	);
}
