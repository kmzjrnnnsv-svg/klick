"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { OPEN_PALETTE_EVENT } from "./command-palette";

// Suchfeld oben in der Seitenleiste (ab 1024 px): öffnet die ⌘K-Palette
// (Navigation und Volltextsuche). Ein Knopf, der wie ein Feld aussieht.
export function SidebarSearch() {
	const t = useTranslations("Nav");
	return (
		<button
			type="button"
			onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
			aria-label={t("searchHint")}
			aria-keyshortcuts="Meta+K Control+K"
			className="flex min-h-(--control-h-sm) w-full items-center gap-2 rounded-lg bg-muted px-2.5 text-left text-muted-foreground text-subhead hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<Search aria-hidden="true" className="size-4 shrink-0" />
			<span className="min-w-0 flex-1 truncate">{t("searchField")}</span>
			<kbd className="rounded border border-border/80 px-1 font-sans text-caption-2">
				⌘K
			</kbd>
		</button>
	);
}
