"use client";

import {
	type ComponentPropsWithoutRef,
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

// Spalte der geteilten Ansicht (styles/base.css, data-split-*): ab 1024 px
// scrollt sie für sich, darunter fließt sie mit der Seite. Inhalt-Spalten
// blenden unten weich aus, solange noch etwas folgt (wie der Scroll-Rand in
// iOS); Listen-Spalten (list) bekommen den Rand per CSS-Maske.
//   main — Hauptinhalt: scrollAppToTop setzt ihn mit zurück

/** Scrollt die Spalte selbst (scrolls) und folgt unten noch Inhalt (more)? */
export function useScrollMore(ref: RefObject<HTMLElement | null>): {
	scrolls: boolean;
	more: boolean;
} {
	const [state, setState] = useState({ scrolls: false, more: false });
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const edge = () => {
			const scrolls = getComputedStyle(el).overflowY === "auto";
			const more =
				scrolls && el.scrollTop + el.clientHeight < el.scrollHeight - 8;
			setState((s) =>
				s.scrolls === scrolls && s.more === more ? s : { scrolls, more },
			);
		};
		edge();
		el.addEventListener("scroll", edge, { passive: true });
		window.addEventListener("resize", edge);
		const size = new ResizeObserver(edge);
		size.observe(el);
		for (const child of el.children) size.observe(child);
		return () => {
			el.removeEventListener("scroll", edge);
			window.removeEventListener("resize", edge);
			size.disconnect();
		};
	}, [ref]);
	return state;
}

/** Weicher Rand am Ende einer Spalte; als letztes Kind einsetzen. Nur
 *  in scrollenden Spalten, sonst stünde er als Lücke unter dem Inhalt. */
export function EdgeFade({ state }: { state: { scrolls: boolean; more: boolean } }) {
	if (!state.scrolls) return null;
	const show = state.more;
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none sticky bottom-0 -mt-12 h-12 shrink-0 bg-gradient-to-t from-background to-transparent transition-opacity duration-200",
				show ? "opacity-100" : "opacity-0",
			)}
		/>
	);
}

type Props = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
	as?: "div" | "nav" | "aside" | "section" | "article";
	list?: boolean;
	main?: boolean;
	children: ReactNode;
};

export function SplitPane({
	as = "div",
	list = false,
	main = false,
	className,
	children,
	...props
}: Props) {
	const ref = useRef<HTMLElement>(null);
	const edge = useScrollMore(ref);
	const Tag = as;
	return (
		<Tag
			ref={ref as never}
			data-split-pane=""
			data-split-list={list ? "" : undefined}
			data-split-main={main ? "" : undefined}
			className={cn("min-w-0", className)}
			{...props}
		>
			{children}
			{!list && <EdgeFade state={edge} />}
		</Tag>
	);
}
