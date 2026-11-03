"use client";

import { useMemo, useRef, useState } from "react";
import { type LinePoint, lineGeometry, nearestIndex } from "@/lib/charts/line";

// Eine Linie über die Zeit (SVG): Gitter bei 0/50/100, Endpunkt mit Wert,
// beim Überfahren ein Fadenkreuz mit Datum und Wert. Die Tabelle daneben
// (beim Aufrufer) ist die Alternative für Screenreader und zum Ablesen.

const W = 600;
const H = 200;
const PAD = 28;
const DATE = new Intl.DateTimeFormat("de-DE", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	timeZone: "UTC",
});
const fmtDate = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`));

export function LineChart({
	points,
	start,
	end,
	label,
	unit = " %",
}: {
	points: readonly LinePoint[];
	start: string;
	end: string;
	// Name der Grafik, z. B. „Abdeckung über die Zeit“
	label: string;
	unit?: string;
}) {
	const g = useMemo(
		() =>
			lineGeometry(points, { width: W, height: H, pad: PAD }, { start, end }),
		[points, start, end],
	);
	const svg = useRef<SVGSVGElement>(null);
	const [hover, setHover] = useState(-1);
	const last = g.coords.at(-1);
	const shown = hover >= 0 ? g.coords[hover] : null;
	const fmt = (v: number) => `${Math.round(v)}${unit}`;
	const summary = last
		? `${label}: ${fmt(g.coords[0]?.value ?? 0)} am ${fmtDate(g.coords[0]?.date ?? start)}, ${fmt(last.value)} am ${fmtDate(last.date)}`
		: label;
	return (
		<div className="relative">
			<svg
				ref={svg}
				viewBox={`0 0 ${W} ${H}`}
				className="h-auto w-full touch-pan-y"
				role="img"
				aria-label={summary}
				onPointerMove={(e) => {
					const el = svg.current;
					if (!el || g.coords.length === 0) return;
					const r = el.getBoundingClientRect();
					const x = ((e.clientX - r.left) / r.width) * W;
					setHover(nearestIndex(g.coords, x));
				}}
				onPointerLeave={() => setHover(-1)}
			>
				{[0, 50, 100].map((v) => {
					const y = PAD + (1 - v / 100) * (H - 2 * PAD);
					return (
						<g key={v}>
							<line
								x1={PAD}
								x2={W - PAD}
								y1={y}
								y2={y}
								className="stroke-border"
								strokeWidth={1}
							/>
							<text
								x={PAD - 6}
								y={y + 4}
								textAnchor="end"
								className="fill-muted-foreground text-caption-2"
							>
								{v}
							</text>
						</g>
					);
				})}
				{g.coords.length > 1 && (
					<path
						d={g.d}
						fill="none"
						className="stroke-primary"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				)}
				{last && (
					<circle cx={last.x} cy={last.y} r={4} className="fill-primary" />
				)}
				{shown && (
					<g>
						<line
							x1={shown.x}
							x2={shown.x}
							y1={PAD}
							y2={H - PAD}
							className="stroke-foreground/40"
							strokeWidth={1}
						/>
						<circle
							cx={shown.x}
							cy={shown.y}
							r={5}
							className="fill-primary stroke-card"
							strokeWidth={2}
						/>
					</g>
				)}
				<text
					x={PAD}
					y={H - 6}
					className="fill-muted-foreground text-caption-2"
				>
					{fmtDate(start)}
				</text>
				<text
					x={W - PAD}
					y={H - 6}
					textAnchor="end"
					className="fill-muted-foreground text-caption-2"
				>
					{fmtDate(end)}
				</text>
			</svg>
			{shown && (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-popover px-2 py-1 text-footnote shadow-md"
					style={{ left: `${(shown.x / W) * 100}%` }}
				>
					<span className="text-muted-foreground">{fmtDate(shown.date)}</span>{" "}
					<span className="font-semibold tabular-nums">{fmt(shown.value)}</span>
				</div>
			)}
		</div>
	);
}
