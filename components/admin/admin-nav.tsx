"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/shell/nav-icon";
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

// Seitenleiste des Admin-Bereichs nach Apple HIG: Gruppen mit Überschrift,
// Symbol in Akzentfarbe, Auswahl getönt. Am Handy dieselben Seiten als
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
			<nav
				aria-label="Admin-Navigation"
				className="flex flex-col gap-5 text-subhead"
			>
				{sections.map((s) => (
					<div key={s.label} className="flex flex-col gap-1">
						<p className="px-2 font-semibold text-footnote text-muted-foreground">
							{s.label}
						</p>
						<ul className="flex flex-col gap-px">
							{s.items.map((item) => {
								const isActive = item.href === active;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											aria-current={isActive ? "page" : undefined}
											className={cn(
												"flex h-8 items-center gap-2.5 rounded-md px-2 text-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11",
												isActive &&
													"bg-primary/12 font-semibold hover:bg-primary/12 dark:bg-primary/20",
											)}
										>
											<NavIcon
												name={item.icon}
												className="size-[1.125rem] shrink-0 text-primary"
											/>
											<span className="truncate">{item.label}</span>
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
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
