"use client";

import { type ComponentProps, useEffect, useRef } from "react";

// Eigene Scrollfläche für Seitenleisten und Spalten (Einstellungen, Hilfe,
// Admin): Mausrad oder Trackpad über der Fläche bewegt nur die Fläche, nie
// den Inhalt daneben — auch nicht am Anfang oder Ende und auch dann nicht,
// wenn die Fläche gerade nicht scrollen muss (CSS overscroll-behavior greift
// dort nicht). Wirkt nur, solange die Fläche selbst scrollt (overflow-y auto
// oder scroll, z. B. erst ab lg); sonst läuft alles wie gewohnt mit der Seite.

type Props = ComponentProps<"div"> & { as?: "div" | "nav" | "aside" };

export function ContainedScroll({ as = "div", ...props }: Props) {
	const ref = useRef<HTMLElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			// Zoomen (Strg + Rad, Pinch) und waagrechtes Scrollen nicht anfassen
			if (e.ctrlKey || e.deltaY === 0) return;
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
			const oy = getComputedStyle(el).overflowY;
			if (oy !== "auto" && oy !== "scroll") return;
			const max = el.scrollHeight - el.clientHeight;
			const atTop = el.scrollTop <= 0;
			const atBottom = el.scrollTop >= max - 1;
			if (max <= 0 || (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom))
				e.preventDefault();
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);
	const Tag = as;
	return <Tag ref={ref as never} {...props} />;
}
