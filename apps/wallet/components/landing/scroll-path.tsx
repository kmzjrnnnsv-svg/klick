"use client";

import { type ReactNode, useEffect, useRef } from "react";
import s from "./landing.module.css";

// Pfad durch eine Liste (Fahrplan, Phasen): Beim Scrollen füllt sich die Linie
// bis zur Lesehöhe (60 % des Fensters) blau, erreichte Punkte werden blau,
// kommende bleiben grau. Ohne Skript bleibt der Pfad grau und alles lesbar.
// Schritte tragen data-step, der Punkt sitzt DOT px unter ihrer Oberkante.
const DOT = 30;
const ANCHOR = 0.6;

export function ScrollPath({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLOListElement>(null);

	useEffect(() => {
		const list = ref.current;
		if (!list) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			const steps = [...list.querySelectorAll<HTMLElement>("[data-step]")];
			const first = steps[0];
			const last = steps.at(-1);
			if (!first || !last) return;
			const top = first.offsetTop + DOT;
			const height = Math.max(1, last.offsetTop - first.offsetTop);
			const anchor = window.innerHeight * ANCHOR;
			const box = list.getBoundingClientRect();
			const progress = (anchor - (box.top + top)) / height;
			list.style.setProperty("--rail-top", `${top}px`);
			list.style.setProperty("--rail-height", `${height}px`);
			list.style.setProperty(
				"--path",
				String(Math.min(1, Math.max(0, progress))),
			);
			for (const step of steps)
				step.toggleAttribute(
					"data-reached",
					step.getBoundingClientRect().top + DOT <= anchor,
				);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, []);

	return (
		<ol ref={ref} className={s.path}>
			{children}
		</ol>
	);
}
