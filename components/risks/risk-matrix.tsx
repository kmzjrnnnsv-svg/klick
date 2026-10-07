import Link from "next/link";
import type { RiskAppetite } from "@/db/schema/platform";
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
	appetite,
	labels,
	codes,
	base = "/risiken",
}: {
	risks: RiskLike[];
	view: "inherent" | "residual";
	appetite: RiskAppetite;
	labels: {
		likelihood: string[];
		impact: string[];
		axisL: string;
		axisI: string;
	};
	codes: Map<string, string>;
	base?: string;
}) {
	const grid = riskMatrix(risks, view, appetite);
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
										aria-label={`Eintrittswahrscheinlichkeit ${cell.likelihood}, Auswirkung ${cell.impact}, Score ${cell.score}, ${cell.riskIds.length} Risiken`}
									>
										<span className="text-muted-foreground">{cell.score}</span>
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
