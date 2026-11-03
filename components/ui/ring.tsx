import Link from "next/link";
import type { ReactNode } from "react";
import { donutArcs, ringFraction, type Tone } from "@/lib/charts/ring";
import { cn } from "@/lib/utils";

// Fortschrittsring und Donut (SVG, serverseitig, ohne Abhängigkeit). Farbe
// trägt nie allein: der Ring hat seine Zahl in der Mitte, der Donut eine
// Legende mit Zahlen, deren Zeilen auf den passenden Filter führen.

export type { Tone };

const STROKE: Record<Tone, string> = {
	primary: "stroke-primary",
	success: "stroke-success",
	warning: "stroke-warning",
	destructive: "stroke-destructive",
	muted: "stroke-muted-foreground/35",
	"chart-1": "stroke-chart-1",
	"chart-2": "stroke-chart-2",
	"chart-3": "stroke-chart-3",
	"chart-4": "stroke-chart-4",
	"chart-5": "stroke-chart-5",
};

export const TONE_DOT: Record<Tone, string> = {
	primary: "bg-primary",
	success: "bg-success",
	warning: "bg-warning",
	destructive: "bg-destructive",
	muted: "bg-muted-foreground/35",
	"chart-1": "bg-chart-1",
	"chart-2": "bg-chart-2",
	"chart-3": "bg-chart-3",
	"chart-4": "bg-chart-4",
	"chart-5": "bg-chart-5",
};

// Kreis mit pathLength 100: Längen direkt in Prozent des Umfangs
const R = 42;

export function Ring({
	value,
	max = 100,
	size = 56,
	stroke = 10,
	tone = "primary",
	label,
	children,
	className,
}: {
	value: number;
	max?: number;
	size?: number;
	stroke?: number;
	tone?: Tone;
	// Vorgelesen statt der Grafik, z. B. „64 % umgesetzt“
	label: string;
	// Mitte, z. B. „64 %“; ohne nur der Ring
	children?: ReactNode;
	className?: string;
}) {
	const f = ringFraction(value, max);
	return (
		<span
			role="img"
			aria-label={label}
			className={cn("relative inline-grid shrink-0 place-items-center", className)}
			style={{ width: size, height: size }}
		>
			<svg viewBox="0 0 100 100" className="-rotate-90 absolute inset-0 size-full" aria-hidden="true">
				<circle cx="50" cy="50" r={R} fill="none" strokeWidth={stroke} className="stroke-muted" />
				{f > 0 && (
					<circle
						cx="50"
						cy="50"
						r={R}
						fill="none"
						strokeWidth={stroke}
						strokeLinecap="round"
						pathLength={100}
						strokeDasharray={`${(f * 100).toFixed(2)} 100`}
						className={STROKE[tone]}
					/>
				)}
			</svg>
			{children !== undefined && (
				<span aria-hidden="true" className="relative font-semibold text-footnote tabular-nums leading-none">
					{children}
				</span>
			)}
		</span>
	);
}

export type DonutItem = {
	key: string;
	label: string;
	value: number;
	tone: Tone;
	// Zeile der Legende führt auf den passenden Filter
	href?: string;
};

export function Donut({
	items,
	label,
	center,
	size = 96,
	stroke = 12,
}: {
	items: readonly DonutItem[];
	// Name der Grafik, z. B. „Zuständigkeit“
	label: string;
	center?: ReactNode;
	size?: number;
	stroke?: number;
}) {
	const arcs = donutArcs(items);
	const tone = new Map(items.map((i) => [i.key, i.tone]));
	const summary = `${label}: ${items.map((i) => `${i.label} ${i.value}`).join(", ")}`;
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
			<span role="img" aria-label={summary} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
				<svg viewBox="0 0 100 100" className="-rotate-90 absolute inset-0 size-full" aria-hidden="true">
					<circle cx="50" cy="50" r={R} fill="none" strokeWidth={stroke} className="stroke-muted" />
					{arcs.map((a) => (
						<circle
							key={a.key}
							cx="50"
							cy="50"
							r={R}
							fill="none"
							strokeWidth={stroke}
							pathLength={100}
							strokeDasharray={`${(a.length * 100).toFixed(2)} 100`}
							strokeDashoffset={(-a.start * 100).toFixed(2)}
							className={STROKE[tone.get(a.key) ?? "muted"]}
						/>
					))}
				</svg>
				{center !== undefined && (
					<span aria-hidden="true" className="relative font-semibold text-title-3 tabular-nums leading-none">
						{center}
					</span>
				)}
			</span>
			<ul className="flex min-w-0 flex-col gap-1 text-subhead">
				{items.map((i) => {
					const row = (
						<>
							<span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", TONE_DOT[i.tone])} />
							<span className="min-w-0 flex-1 truncate">{i.label}</span>
							<span className="font-semibold tabular-nums">{i.value}</span>
						</>
					);
					return (
						<li key={i.key}>
							{i.href ? (
								<Link
									href={i.href}
									className="hit-area flex items-center gap-2 rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{row}
								</Link>
							) : (
								<span className="flex items-center gap-2">{row}</span>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
