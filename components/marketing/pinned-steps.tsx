"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// Drei Aussagen links, rechts ein angehefteter Ausschnitt, der den Zustand
// der Aussage zeigt, die der Bildmitte am nächsten ist. Ohne Skript bleibt der
// erste Zustand stehen; alle Aussagen bleiben lesbar. Auf schmalen
// Bildschirmen steht jeder Ausschnitt unter seiner Aussage (nichts überdeckt
// den Text).
export function PinnedSteps({
	title,
	steps,
	classes,
}: {
	title: string;
	steps: { title: string; note: string; fragment: ReactNode }[];
	classes: {
		root: string;
		text: string;
		heading: string;
		step: string;
		stepTitle: string;
		stepNote: string;
		stage: string;
		state: string;
		inline: string;
	};
}) {
	const [active, setActive] = useState(0);
	const refs = useRef<(HTMLDivElement | null)[]>([]);
	useEffect(() => {
		if (!("IntersectionObserver" in window)) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries)
					if (e.isIntersecting) {
						const i = refs.current.indexOf(e.target as HTMLDivElement);
						if (i >= 0) setActive(i);
					}
			},
			{ rootMargin: "-45% 0px -45% 0px" },
		);
		for (const el of refs.current) if (el) io.observe(el);
		return () => io.disconnect();
	}, []);
	return (
		<div className={classes.root}>
			<div className={classes.text}>
				<h2 className={classes.heading} data-r="">
					{title}
				</h2>
				{steps.map((s, i) => (
					<div
						key={s.title}
						ref={(el) => {
							refs.current[i] = el;
						}}
						className={classes.step}
						data-active={i === active ? "" : undefined}
					>
						<p className={classes.stepTitle}>{s.title}</p>
						<p className={classes.stepNote}>{s.note}</p>
						{/* schmale Bildschirme: Ausschnitt direkt unter der Aussage */}
						<div className={classes.inline}>{s.fragment}</div>
					</div>
				))}
			</div>
			<div className={classes.stage}>
				{steps.map((s, i) => (
					<div
						key={s.title}
						className={classes.state}
						data-active={i === active ? "" : undefined}
						aria-hidden={i === active ? undefined : true}
					>
						{s.fragment}
					</div>
				))}
			</div>
		</div>
	);
}
