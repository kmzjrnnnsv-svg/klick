import type { RiskMethod } from "@/db/schema/platform";
import { aggregate, classify } from "@/lib/compliance/risk-method";
import { cn } from "@/lib/utils";

export const ZONE_CELL: Record<string, string> = {
	acceptable: "bg-success/15",
	tolerable: "bg-warning/25",
	unacceptable: "bg-destructive/15",
};

// Kompakte 5×5-Vorschau der Methodik (Einstellungen, Assistent): Zellen
// zeigen den Risikowert, Farbe nach Zone, optional ein markierter Punkt.
export function MethodMatrix({
	method,
	mark,
	className,
}: {
	method: Pick<RiskMethod, "aggregation" | "classes" | "likelihood" | "impact">;
	mark?: { likelihood: number; impact: number } | null;
	className?: string;
}) {
	const rows = [5, 4, 3, 2, 1];
	const cols = [1, 2, 3, 4, 5];
	return (
		<table
			className={cn(
				"border-separate border-spacing-0.5 text-[0.7rem] tabular-nums",
				className,
			)}
		>
			<caption className="sr-only">
				Risikomatrix: Zeilen Eintrittswahrscheinlichkeit 5 bis 1, Spalten
				Schadenshöhe 1 bis 5
			</caption>
			<thead>
				<tr>
					<th className="px-1 text-left font-normal text-muted-foreground">
						EW ↓ SH →
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
									title={`${score} · ${cls.label}`}
									className={cn(
										"size-8 rounded-sm text-center",
										ZONE_CELL[cls.zone],
										marked && "ring-2 ring-foreground font-semibold",
									)}
								>
									{score}
								</td>
							);
						})}
					</tr>
				))}
			</tbody>
		</table>
	);
}
