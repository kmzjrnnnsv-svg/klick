import Link from "next/link";
import type { Tone } from "@/lib/charts/ring";
import { cn } from "@/lib/utils";
import { TONE_DOT } from "../ui/ring";

// Waagrecht gestapelte Balken je Zeile (z. B. offene Punkte je Person):
// Länge relativ zur größten Zeile, 2 px Lücke zwischen den Teilen, Legende
// mit Summen und die Zahlen als Tabelle zum Aufklappen. Farbe trägt nie
// allein.

export type BarCategory = { key: string; label: string; tone: Tone };
export type BarRow = {
	key: string;
	label: string;
	href?: string;
	values: Record<string, number>;
};

export function StackedBars({
	categories,
	rows,
	label,
	tableLabel,
	totalLabel,
	empty,
}: {
	categories: readonly BarCategory[];
	rows: readonly BarRow[];
	// Name der Grafik für Screenreader
	label: string;
	// „Als Tabelle“
	tableLabel: string;
	totalLabel: string;
	empty: string;
}) {
	if (rows.length === 0)
		return <p className="text-footnote text-muted-foreground">{empty}</p>;
	const total = (r: BarRow) =>
		categories.reduce((s, c) => s + (r.values[c.key] ?? 0), 0);
	const max = Math.max(1, ...rows.map(total));
	const sums = categories.map((c) => ({
		...c,
		sum: rows.reduce((s, r) => s + (r.values[c.key] ?? 0), 0),
	}));
	return (
		<figure aria-label={label} className="flex flex-col gap-3">
			<ul className="flex flex-wrap gap-x-4 gap-y-1 text-footnote">
				{sums.map((c) => (
					<li key={c.key} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className={cn("size-2.5 rounded-full", TONE_DOT[c.tone])}
						/>
						{c.label}
						<span className="font-semibold tabular-nums">{c.sum}</span>
					</li>
				))}
			</ul>
			<ul className="flex flex-col gap-2" aria-hidden="true">
				{rows.map((r) => {
					const t = total(r);
					const head = (
						<span className="flex items-baseline justify-between gap-2 text-subhead">
							<span className="min-w-0 truncate">{r.label}</span>
							<span className="shrink-0 tabular-nums text-muted-foreground">
								{t}
							</span>
						</span>
					);
					return (
						<li key={r.key} className="flex flex-col gap-1">
							{r.href ? (
								<Link
									href={r.href}
									tabIndex={-1}
									className="underline-offset-4 hover:underline"
								>
									{head}
								</Link>
							) : (
								head
							)}
							<span
								className="flex h-2.5 gap-0.5"
								style={{ width: `${Math.max(2, (t / max) * 100)}%` }}
							>
								{categories.map((c) => {
									const v = r.values[c.key] ?? 0;
									if (v === 0) return null;
									return (
										<span
											key={c.key}
											className={cn("h-full rounded-full", TONE_DOT[c.tone])}
											style={{ flexGrow: v, flexBasis: 0 }}
										/>
									);
								})}
							</span>
						</li>
					);
				})}
			</ul>
			<details>
				<summary className="hit-area w-fit cursor-pointer text-footnote text-primary">
					{tableLabel}
				</summary>
				<table className="mt-2 w-full text-footnote">
					<thead>
						<tr className="text-left text-muted-foreground">
							<th className="py-1 font-normal" />
							{categories.map((c) => (
								<th key={c.key} className="py-1 text-right font-normal">
									{c.label}
								</th>
							))}
							<th className="py-1 text-right font-normal">{totalLabel}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.key} className="border-t">
								<td className="py-1">
									{r.href ? (
										<Link href={r.href} className="hover:underline">
											{r.label}
										</Link>
									) : (
										r.label
									)}
								</td>
								{categories.map((c) => (
									<td key={c.key} className="py-1 text-right tabular-nums">
										{r.values[c.key] ?? 0}
									</td>
								))}
								<td className="py-1 text-right font-medium tabular-nums">
									{total(r)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</details>
		</figure>
	);
}
