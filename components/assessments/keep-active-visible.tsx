"use client";

import { useEffect, useRef } from "react";

// Hält das aktive Kapitel in der Kapitelliste sichtbar: ab 1024 px in der
// eigenen Spalte (senkrecht), am Handy in der Chip-Leiste (waagrecht).
// Bewegt nur den Scrollbereich der Liste selbst, nie Fenster oder Seite.
export function KeepActiveVisible({ active }: { active: string }) {
	const marker = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		const list = marker.current?.parentElement;
		const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!list || !current || !active) return;
		const a = current.getBoundingClientRect();
		for (
			let el: HTMLElement | null = current.parentElement;
			el && el !== list.parentElement;
			el = el.parentElement
		) {
			const style = getComputedStyle(el);
			const c = el.getBoundingClientRect();
			if (
				/auto|scroll/.test(style.overflowY) &&
				el.scrollHeight > el.clientHeight
			) {
				if (a.top < c.top) el.scrollTop += a.top - c.top - 8;
				else if (a.bottom > c.bottom) el.scrollTop += a.bottom - c.bottom + 8;
			}
			if (
				/auto|scroll/.test(style.overflowX) &&
				el.scrollWidth > el.clientWidth
			) {
				if (a.left < c.left) el.scrollLeft += a.left - c.left - 8;
				else if (a.right > c.right) el.scrollLeft += a.right - c.right + 8;
			}
		}
	}, [active]);
	return <span ref={marker} hidden />;
}
