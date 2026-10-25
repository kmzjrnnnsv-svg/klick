"use client";

import { useEffect, useState } from "react";
import s from "./atlas-index.module.css";

export type AtlasIndexGroup = {
	key: string;
	title: string;
	count: number;
	countLabel: string;
};

// Höhe im Fenster, ab der ein Bereich als „gerade gelesen“ gilt
const ANCHOR = 0.35;

// Index der Bereiche auf /funktionen: Seitenleiste am Desktop, waagrecht
// scrollende Kapseln am Handy. Der Bereich, in dem du gerade liest, ist
// markiert (aria-current). Ohne Skript bleibt es eine Liste von Ankern.
export function AtlasIndex({
	label,
	groups,
}: {
	label: string;
	groups: AtlasIndexGroup[];
}) {
	const [active, setActive] = useState<string | null>(null);

	useEffect(() => {
		const targets = groups
			.map((g) => document.getElementById(`bereich-${g.key}`))
			.filter((el): el is HTMLElement => el !== null);
		let frame = 0;
		const update = () => {
			frame = 0;
			const line = window.innerHeight * ANCHOR;
			let current: string | null = null;
			for (const el of targets) {
				const box = el.getBoundingClientRect();
				if (box.top <= line && box.bottom > line)
					current = el.id.slice("bereich-".length);
			}
			setActive(current);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [groups]);

	return (
		<nav className={s.index} aria-label={label}>
			<p className={s.word} aria-hidden="true">
				{label}
			</p>
			<ul className={s.list}>
				{groups.map((g) => (
					<li key={g.key}>
						<a
							href={`#bereich-${g.key}`}
							className={s.link}
							aria-current={active === g.key ? "true" : undefined}
						>
							<span className={s.name}>{g.title}</span>
							<span className={s.count} aria-hidden="true">
								{g.count}
							</span>
							<span className="sr-only">, {g.countLabel}</span>
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
