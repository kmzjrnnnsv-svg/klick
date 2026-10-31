import type { RiskMethod } from "@/db/schema/platform";
import { aggregate, classify, levelCount } from "@/lib/compliance/risk-method";
import { cn } from "@/lib/utils";

export const ZONE_CELL: Record<string, string> = {
	acceptable: "bg-success/15",
	tolerable: "bg-warning/25",
	unacceptable: "bg-destructive/15",
};

// Kompakte Vorschau der Methodik (Einstellungen, Assistent), 4×4 oder 5×5:
// Zellen zeigen den Risikowert (bei Matrix die Klasse), Farbe nach Zone,
// optional ein markierter Punkt.
export function MethodMatrix({
	method,
	mark,
	className,
}: {
	method: Pick<
		RiskMethod,
		"aggregation" | "classes" | "likelihood" | "impact" | "matrix"
	>;
	mark?: { likelihood: number; impact: number } | null;
	className?: string;
}) {
	const n = levelCount(method);
	const cols = Array.from({ length: n }, (_, i) => i + 1);
	const rows = [...cols].reverse();
	const matrix = method.aggregation === "matrix";
	return (
		<table
			className={cn(
				"border-separate border-spacing-0.5 text-footnote tabular-nums",
				className,
			)}
		>
			<caption className="sr-only">
				Risikomatrix: Zeilen Eintrittswahrscheinlichkeit {n} bis 1, Spalten
				Schadenshöhe 1 bis {n}
			</caption>
			<thead>
				<tr>
					<th className="px-1 text-left font-normal text-muted-foreground">
						Zeile EW, Spalte SH
					</th>
					{cols.map((i) => (
						<th
							key={i}
							scope="col"
							title={method.impact[i - 1]}
							className="px-1 font-normal text-muted-foreground"
						>
							{i}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((l) => (
					<tr key={l}>
						<th
							scope="row"
							title={method.likelihood[l - 1]?.label}
							className="pr-1 text-right font-normal text-muted-foreground"
						>
							{l}
						</th>
						{cols.map((i) => {
							const score = aggregate(l, i, method);
							const cls = classify(score, method);
							const marked = mark?.likelihood === l && mark?.impact === i;
							return (
								<td
									key={i}
									title={matrix ? cls.label : `${score} · ${cls.label}`}
									className={cn(
										"rounded-sm text-center",
										matrix ? "h-8 min-w-12 px-1" : "size-8",
										ZONE_CELL[cls.zone],
										marked && "ring-2 ring-foreground font-semibold",
									)}
								>
									{matrix ? cls.label : score}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}
