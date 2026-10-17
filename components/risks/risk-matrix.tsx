import Link from "next/link";
import type { RiskMethod } from "@/db/schema/platform";
import {
	type MatrixCell,
	type RiskLike,
	riskMatrix,
} from "@/lib/compliance/risk";
import { cn } from "@/lib/utils";

const ZONE_BG: Record<MatrixCell["zone"], string> = {
	acceptable: "bg-success/15",
	tolerable: "bg-warning/25",
	unacceptable: "bg-destructive/15",
};

// 5×5-Matrix mit Chips; Klick auf eine Zelle filtert das Register (?l=&i=).
export function RiskMatrix({
	risks,
	view,
	method,
	labels,
	codes,
	base = "/risiken",
}: {
	risks: RiskLike[];
	view: "inherent" | "residual";
	method: RiskMethod;
	labels: {
		likelihood: string[];
		impact: string[];
		axisL: string;
		axisI: string;
	};
	codes: Map<string, string>;
	base?: string;
}) {
	const grid = riskMatrix(risks, view, method);
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[40rem] border-separate border-spacing-1 text-xs">
				<thead>
					<tr>
						<th className="w-28 text-left align-bottom font-normal text-muted-foreground">
							{labels.axisL} ↓ · {labels.axisI} →
						</th>
						{[1, 2, 3, 4, 5].map((i) => (
							<th key={i} className="pb-1 font-normal text-muted-foreground">
								{i} · {labels.impact[i - 1]}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{grid.map((row, ri) => (
						<tr key={row[0]?.likelihood}>
							<th className="pr-2 text-right font-normal text-muted-foreground">
								{5 - ri} · {labels.likelihood[4 - ri]}
							</th>
							{row.map((cell) => (
								<td
									key={`${cell.likelihood}-${cell.impact}`}
									className="h-16 align-top"
								>
									<Link
										href={`${base}?tab=register&l=${cell.likelihood}&i=${cell.impact}&view=${view}`}
										className={cn(
											"flex h-full min-h-16 flex-col gap-1 rounded-sm border border-transparent p-1.5 transition-colors hover:border-foreground/30",
											ZONE_BG[cell.zone],
										)}
										aria-label={`Eintrittswahrscheinlichkeit ${cell.likelihood}, Schadenshöhe ${cell.impact}, Risikowert ${cell.score} (${cell.cls.label}), ${cell.riskIds.length} Risiken`}
									>
										<span className="text-muted-foreground">
											{cell.score} · {cell.cls.label}
										</span>
										<span className="flex flex-wrap gap-1">
											{cell.riskIds.slice(0, 6).map((id) => (
												<span
													key={id}
													className="rounded-sm bg-background/80 px-1 font-mono text-[0.6rem]"
												>
													{codes.get(id) ?? "?"}
												</span>
											))}
											{cell.riskIds.length > 6 && (
												<span className="text-[0.6rem] text-muted-foreground">
													+{cell.riskIds.length - 6}
												</span>
											)}
										</span>
									</Link>
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// Legende + Verteilung je Klasse vorher/nachher (Excel-„Dashboard“).
export function ClassLegend({
	method,
	dist,
	labels,
}: {
	method: RiskMethod;
	dist: {
		key: string;
		label: string;
		zone: string;
		inherent: number;
		residual: number;
	}[];
	labels: { inherent: string; residual: string; title: string };
}) {
	const max = Math.max(1, ...dist.flatMap((d) => [d.inherent, d.residual]));
	return (
		<section className="mt-6 flex flex-col gap-3" aria-label={labels.title}>
			<h3 className="font-medium text-sm">{labels.title}</h3>
			<ul className="flex flex-col gap-3 text-xs">
				{dist.map((d) => {
					const cls = method.classes.find((c) => c.key === d.key);
					return (
						<li
							key={d.key}
							className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(10rem,16rem)_1fr]"
						>
							<div>
								<p className="flex items-center gap-2 font-medium">
									<span
										aria-hidden
										className={cn(
											"inline-block size-3 rounded-sm",
											ZONE_BG[d.zone as MatrixCell["zone"]],
										)}
									/>
									{d.label}
									<span className="font-normal text-muted-foreground tabular-nums">
										{cls ? `${cls.min}–${cls.max}` : ""}
									</span>
								</p>
								{cls?.meaning && (
									<p className="mt-0.5 text-muted-foreground">{cls.meaning}</p>
								)}
							</div>
							<div className="flex flex-col gap-1">
								{(
									[
										["inherent", d.inherent],
										["residual", d.residual],
									] as const
								).map(([k, n]) => (
									<div key={k} className="flex items-center gap-2">
										<span className="w-24 shrink-0 text-muted-foreground">
											{labels[k]}
										</span>
										<span
											className={cn(
												"h-3 rounded-sm",
												ZONE_BG[d.zone as MatrixCell["zone"]],
												k === "residual" && "opacity-70",
											)}
											style={{
												width: `${(n / max) * 100}%`,
												minWidth: n ? "0.5rem" : 0,
											}}
										/>
										<span className="tabular-nums">{n}</span>
									</div>
								))}
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
