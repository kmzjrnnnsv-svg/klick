"use client";

import type { WalletNavGroup } from "@wallet/lib/nav";
import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

// ⌘K springt zu jeder Seite von both.money — wie die Palette in Klick
// (components/shell/command-palette.tsx). Die Palette (cmdk) lädt erst beim
// ersten Öffnen; das Suchfeld oben in der Seitenleiste öffnet sie.
const PaletteDialog = dynamic(
	() => import("./command-palette-dialog").then((m) => m.PaletteDialog),
	{ ssr: false },
);

const OPEN_EVENT = "both:open-palette";

export function CommandPalette({ groups }: { groups: WalletNavGroup[] }) {
	const [open, setOpen] = useState(false);
	const [everOpened, setEverOpened] = useState(false);
	useEffect(() => {
		if (open) setEverOpened(true);
	}, [open]);
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			}
		}
		const onOpen = () => setOpen(true);
		document.addEventListener("keydown", onKey);
		window.addEventListener(OPEN_EVENT, onOpen);
		return () => {
			document.removeEventListener("keydown", onKey);
			window.removeEventListener(OPEN_EVENT, onOpen);
		};
	}, []);
	return everOpened ? (
		<PaletteDialog groups={groups} open={open} onOpenChange={setOpen} />
	) : null;
}

// Ein Knopf, der wie ein Feld aussieht (wie „Suchen …“ in Klick)
export function SidebarSearch() {
	const t = useTranslations("Shell");
	return (
		<button
			type="button"
			onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
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
