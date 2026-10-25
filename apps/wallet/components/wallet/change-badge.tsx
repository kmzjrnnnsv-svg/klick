// Eigene Datei ohne Server-Importe: auch in Client-Komponenten nutzbar
// Veränderung mit Vorzeichen und Farbe wie in Apple Aktien — nie Farbe allein,
// ohne Pfeil (docs/design/hig.md, „Pfeile und Chevrons“)
export function ChangeBadge({ bp }: { bp: number | null }) {
	if (bp === null)
		return <span className="text-muted-foreground text-footnote">—</span>;
	const up = bp >= 0;
	return (
		<span
			className={`inline-flex items-center gap-0.5 text-footnote tabular-nums ${up ? "text-success" : "text-destructive"}`}
		>
			{up ? "+" : "−"}
			{(Math.abs(bp) / 100).toLocaleString("de-DE", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			})}
			&nbsp;%
		</span>
	);
}
