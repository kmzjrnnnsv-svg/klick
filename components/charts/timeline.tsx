import Link from "next/link";
import { monthTicks, timelinePosition } from "@/lib/charts/timeline";
import { cn } from "@/lib/utils";
import { TONE_DOT, type Tone } from "../ui/ring";

// Zeitleiste (SVG-frei, serverseitig): oben die Achse mit Monaten, „Heute“
// und Punkten je Termin (ab 640 px), darunter immer dieselben Termine als
// Liste — die Liste ist die Alternative zur Grafik und am Handy die Ansicht.

export type TimelineItem = {
	key: string;
	date: string;
	label: string;
	detail?: string;
	tone: Tone;
	href?: string;
};

const MONTH = new Intl.DateTimeFormat("de-DE", {
	month: "short",
	timeZone: "UTC",
});
const DATE = new Intl.DateTimeFormat("de-DE", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	timeZone: "UTC",
});
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

export function Timeline({
	start,
	end,
	items,
	label,
	todayLabel,
	today,
	empty,
}: {
	start: string;
	end: string;
	items: readonly TimelineItem[];
	// Name der Grafik für Screenreader
	label: string;
	todayLabel: string;
	today: string;
	empty: string;
}) {
	const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
	const ticks = monthTicks(start, end);
	const todayAt = timelinePosition(start, end, today) * 100;
	return (
		<figure aria-label={label} className="flex flex-col gap-3">
			<div className="relative hidden h-12 sm:block" aria-hidden="true">
				<div className="absolute inset-x-0 top-7 h-1 rounded-full bg-muted" />
				{ticks.map((t) => (
					<span
						key={t.date}
						className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1"
						style={{ left: `${t.position * 100}%` }}
					>
						<span className="text-caption-2 text-muted-foreground">
							{MONTH.format(asDate(t.date))}
						</span>
						<span className="h-3 w-px bg-border" />
					</span>
				))}
				<span
					className="absolute top-5 flex flex-col items-start"
					style={{ left: `${todayAt}%` }}
				>
					<span className="h-5 w-0.5 rounded-full bg-foreground" />
				</span>
				{sorted.map((i) => (
					<span
						key={i.key}
						title={`${DATE.format(asDate(i.date))} · ${i.label}`}
						className={cn(
							"absolute top-[1.5625rem] size-3 -translate-x-1/2 rounded-full ring-2 ring-card",
							TONE_DOT[i.tone],
						)}
						style={{ left: `${timelinePosition(start, end, i.date) * 100}%` }}
					/>
				))}
			</div>
			{sorted.length === 0 ? (
				<p className="text-footnote text-muted-foreground">{empty}</p>
			) : (
				<ol className="flex flex-col gap-1.5 text-subhead">
					{sorted.map((i) => {
						const body = (
							<>
								<span
									aria-hidden="true"
									className={cn(
										"size-2.5 shrink-0 rounded-full",
										TONE_DOT[i.tone],
									)}
								/>
								<span className="w-24 shrink-0 tabular-nums text-muted-foreground">
									{i.date === today ? todayLabel : DATE.format(asDate(i.date))}
								</span>
								<span className="min-w-0 flex-1">
									{i.label}
									{i.detail && (
										<span className="text-muted-foreground"> · {i.detail}</span>
									)}
								</span>
							</>
						);
						return (
							<li key={i.key}>
								{i.href ? (
									<Link
										href={i.href}
										className="hit-area flex items-center gap-2 underline-offset-4 hover:underline"
									>
										{body}
									</Link>
								) : (
									<span className="flex items-center gap-2">{body}</span>
								)}
							</li>
						);
					})}
				</ol>
			)}
		</figure>
	);
}
