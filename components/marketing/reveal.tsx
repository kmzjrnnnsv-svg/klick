"use client";

import { type ReactNode, useEffect, useRef } from "react";

// Auftritt beim Scrollen für Marketingseiten: Elemente mit data-r (Teile
// eines Abschnitts) und data-block (ganze Kompositionen) bekommen data-in,
// sobald sie ins Bild kommen. Ohne Skript bleibt alles sichtbar; was beim
// Laden schon im Bild ist, erscheint ohne Verzögerung (kein Flackern).
export function RevealRoot({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = ref.current;
		if (!root || !("IntersectionObserver" in window)) return;
		const items = [
			...root.querySelectorAll<HTMLElement>("[data-r], [data-block]"),
		];
		const fold = window.innerHeight;
		for (const el of items)
			if (el.getBoundingClientRect().top < fold * 0.9)
				el.setAttribute("data-in", "");
		root.setAttribute("data-js", "");
		const show = (
			entries: IntersectionObserverEntry[],
			o: IntersectionObserver,
		) => {
			for (const e of entries)
				if (e.isIntersecting) {
					e.target.setAttribute("data-in", "");
					o.unobserve(e.target);
				}
		};
		// Teile kurz vor dem Bildrand, ganze Kompositionen (Verschluss) etwas
		// früher, damit die Bewegung fertig ist, wenn man hinsieht.
		const parts = new IntersectionObserver(show, {
			rootMargin: "0px 0px -8% 0px",
			threshold: 0.08,
		});
		const blocks = new IntersectionObserver(show, {
			rootMargin: "0px 0px 25% 0px",
		});
		for (const el of items)
			if (!el.hasAttribute("data-in"))
				(el.hasAttribute("data-block") ? blocks : parts).observe(el);
		return () => {
			parts.disconnect();
			blocks.disconnect();
		};
	}, []);
	return (
		<div ref={ref} className={className}>
			{children}
		</div>
	);
}
