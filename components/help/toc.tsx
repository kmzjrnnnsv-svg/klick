"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { scrollRoot } from "@/components/ui/scroll";
import { cn } from "@/lib/utils";

// „Auf dieser Seite“ mit Markierung des Abschnitts, in dem du gerade liest.
// Hört auf den Bereich, der wirklich scrollt: die Artikel-Spalte der
// geteilten Ansicht (data-split-main), sonst die rechte Spalte der App bzw.
// das Fenster.
export function HelpToc({
	label,
	items,
}: {
	label: string;
	items: { id: string; label: string }[];
}) {
	const [current, setCurrent] = useState(items[0]?.id ?? "");

	useEffect(() => {
		const main = document.querySelector<HTMLElement>("[data-split-main]");
		const pane =
			main && getComputedStyle(main).overflowY === "auto" ? main : null;
		const source: HTMLElement | Window = pane ?? scrollRoot() ?? window;
		let frame = 0;
		const update = () => {
			frame = 0;
			const top = (pane ?? scrollRoot())?.getBoundingClientRect().top ?? 0;
			let id = items[0]?.id ?? "";
			for (const it of items) {
				const el = document.getElementById(it.id);
				// Abschnitt gilt, sobald seine Überschrift das obere Drittel erreicht
				if (el && el.getBoundingClientRect().top - top < 120) id = it.id;
			}
			setCurrent(id);
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		source.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			source.removeEventListener("scroll", onScroll);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [items]);

	return (
		<nav aria-label={label} className="hidden lg:block">
			<h2 className="mb-2 px-4 font-semibold text-foreground text-subhead">
				{label}
			</h2>
			<ul className="flex flex-col">
				{items.map((x) => (
					<li key={x.id}>
						<Link
							href={`#${x.id}`}
							aria-current={x.id === current ? "location" : undefined}
							className={cn(
								"block rounded-lg px-4 py-1.5 text-footnote hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								x.id === current
									? "bg-muted/60 font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{x.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
