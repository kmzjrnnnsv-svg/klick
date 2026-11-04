"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { moveIndex } from "./keyboard";

// ↑/↓ wandert durch die Einträge einer Liste (Links), Pos1/Ende springen
// an Anfang und Ende — wie die Seitenleiste in Mac-Apps. Aus dem Suchfeld
// der Liste (data-page-search) geht ↓ zum ersten Eintrag, vom ersten
// Eintrag ↑ zurück ins Suchfeld. Geöffnet wird mit der Eingabetaste
// (normaler Link), nicht schon beim Wandern: jeder Wechsel wäre sonst eine
// Anfrage an den Server.
//   rows — nur Links mit diesem Selektor zählen (z. B. Zeilen eines Registers)

const visible = (el: HTMLElement) => el.getClientRects().length > 0;

export function ListKeys({
	children,
	className,
	rows = "a[href]",
}: {
	children: ReactNode;
	className?: string;
	rows?: string;
}) {
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = root.current;
		if (!el) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
			const target = e.target as HTMLElement;
			const search = el.querySelector<HTMLInputElement>("[data-page-search]");
			const inSearch = search !== null && target === search;
			// im Suchfeld gehören Pos1/Ende dem Textcursor
			if (inSearch && (e.key === "Home" || e.key === "End")) return;
			const items = [...el.querySelectorAll<HTMLElement>(rows)].filter(
				visible,
			);
			const current = inSearch ? -1 : items.indexOf(target);
			if (!inSearch && current < 0) return;
			const next = moveIndex(current, items.length, e.key);
			if (next === null) return;
			e.preventDefault();
			const to = next < 0 ? search : items[next];
			if (!to) return;
			to.focus();
			to.scrollIntoView({ block: "nearest" });
		};
		el.addEventListener("keydown", onKey);
		return () => el.removeEventListener("keydown", onKey);
	}, [rows]);
	return (
		<div ref={root} className={cn(className)}>
			{children}
		</div>
	);
}
