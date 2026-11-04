import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDays, monthTicks, timelinePosition } from "@/lib/charts/timeline";

// Balkenplan (Gantt) ohne SVG und ohne Abhängigkeit, wie die Zeitleiste:
// Monatsachse, Marke „Heute“, Zeilen in Gruppen, je Balken ein Link mit
// Daten im Klartext. Keine Pfeile: Vorgänger stehen als Text in der Zeile.
// Ab 640 px; darunter und für Screenreader zeigt die Seite eine Liste bzw.
// Tabelle (Aufrufer).

export type GanttRow = {
	key: string;
	label: React.ReactNode;
	// Zusatz rechts der Bezeichnung (z. B. Dauer ändern)
	aside?: React.ReactNode;
	start: string;
	// letzter Tag (einschließlich)
	end: string;
	tone: GanttTone;
	href?: string;
	ariaLabel: string;
};

export type GanttGroup = { key: string; label: string; rows: GanttRow[] };

export type GanttTone = "primary" | "success" | "warning" | "muted";

export const GANTT_TONE: Record<GanttTone, string> = {
	primary: "bg-primary",
	success: "bg-success",
	warning: "bg-warning",
	muted: "bg-muted-foreground/40",
};

const monthFmt = new Intl.DateTimeFormat("de-DE", {
	month: "short",
	timeZone: "UTC",
});
const yearFmt = new Intl.DateTimeFormat("de-DE", {
	year: "numeric",
	timeZone: "UTC",
});

function tickLabel(date: string, first: boolean): string {
	const d = new Date(`${date}T00:00:00Z`);
	const m = monthFmt.format(d);
	return first || d.getUTCMonth() === 0 ? `${m} ${yearFmt.format(d)}` : m;
}

// Bei langen Plänen nur jeden zweiten bzw. dritten Monat beschriften,
// damit sich die Beschriftungen nicht überlappen
function labelStep(ticks: number): number {
	return ticks > 24 ? 3 : ticks > 12 ? 2 : 1;
}

export function Gantt({
	start,
	end,
	today,
	todayLabel,
	groups,
	labelHeader,
	ariaLabel,
}: {
	start: string;
	end: string;
	today?: string;
	todayLabel: string;
	groups: readonly GanttGroup[];
	labelHeader: string;
	ariaLabel: string;
}) {
	// Achse bis zum Ende des letzten Tages
	const axisEnd = addDays(end, 1);
	const pos = (d: string) => timelinePosition(start, axisEnd, d) * 100;
	const ticks = monthTicks(start, axisEnd);
	const todayPos = today && today >= start && today <= end ? pos(today) : null;
	const grid = "grid grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-x-3";
	const step = labelStep(ticks.length);
	const axis = (
		<div className={grid} aria-hidden="true">
			<span className="font-medium text-footnote text-muted-foreground">
				{labelHeader}
			</span>
			<div className="relative h-6">
				{ticks.map((tk, i) =>
					i % step === 0 ? (
						<span
							key={tk.date}
							className="absolute top-0 whitespace-nowrap pl-1 text-caption-1 text-muted-foreground"
							style={{ left: `${tk.position * 100}%` }}
						>
							{tickLabel(tk.date, i === 0)}
						</span>
					) : null,
				)}
				{todayPos !== null && (
					<span
						className="absolute bottom-0 -translate-x-1/2 rounded bg-destructive px-1 text-caption-2 text-white"
						style={{ left: `${todayPos}%` }}
					>
						{todayLabel}
					</span>
				)}
			</div>
		</div>
	);
	const marks = (
		<>
			{ticks.map((tk) => (
				<span
					key={tk.date}
					className="absolute inset-y-0 border-border border-l"
					style={{ left: `${tk.position * 100}%` }}
					aria-hidden="true"
				/>
			))}
			{todayPos !== null && (
				<span
					className="absolute inset-y-0 border-destructive border-l-2"
					style={{ left: `${todayPos}%` }}
					aria-hidden="true"
				/>
			)}
		</>
	);
	return (
		<figure aria-label={ariaLabel} className="flex flex-col gap-1">
			{axis}
			{groups.map((g) => (
				<details key={g.key} open className="group border-t">
					<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 font-semibold text-subhead [&::-webkit-details-marker]:hidden">
						<ChevronRight
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
						/>
						{g.label}
						<span className="font-normal text-muted-foreground">
							({g.rows.length})
						</span>
					</summary>
					<ul className="flex flex-col pb-2">
						{g.rows.map((r) => {
							const left = pos(r.start);
							const width = Math.max(0.6, pos(addDays(r.end, 1)) - left);
							const bar = (
								<span
									className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full ${GANTT_TONE[r.tone]}`}
									style={{ left: `${left}%`, width: `${width}%` }}
								/>
							);
							return (
								<li key={r.key} className={`${grid} items-center py-0.5`}>
									<span className="flex min-w-0 items-center gap-2 text-subhead">
										<span className="min-w-0 grow truncate">{r.label}</span>
										{r.aside}
									</span>
									<span className="relative block h-7">
										{marks}
										{r.href ? (
											<Link
												href={r.href}
												aria-label={r.ariaLabel}
												title={r.ariaLabel}
												className="absolute inset-0 rounded focus-visible:outline-2 focus-visible:outline-primary"
											>
												{bar}
											</Link>
										) : (
											<span role="img" aria-label={r.ariaLabel}>
												{bar}
											</span>
										)}
									</span>
								</li>
							);
						})}
					</ul>
				</details>
			))}
			{axis}
		</figure>
	);
}
