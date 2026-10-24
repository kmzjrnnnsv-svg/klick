import { ArrowDownRight, ArrowUpRight } from "lucide-react";

// Eigene Datei ohne Server-Importe: auch in Client-Komponenten nutzbar
// Veränderung mit Zeichen und Pfeil — nie Farbe allein
export function ChangeBadge({ bp }: { bp: number | null }) {
	if (bp === null)
		return <span className="text-muted-foreground text-footnote">—</span>;
	const up = bp >= 0;
	const Icon = up ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-footnote tabular-nums ${up ? "text-success" : "text-destructive"}`}
		>
			<Icon className="size-3" aria-hidden />
			{up ? "+" : "−"}
			{(Math.abs(bp) / 100).toLocaleString("de-DE", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})}
			&nbsp;%
		</span>
	);
}
