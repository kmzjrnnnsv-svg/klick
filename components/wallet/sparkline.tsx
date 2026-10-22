// Mini-Verlauf (7 Tage) in der zurückhaltenden Farbe — nur Tendenz, keine
// Werte (die stehen daneben als Zahl)
export function Sparkline({
	values,
	width = 96,
	height = 28,
}: {
	values: number[];
	width?: number;
	height?: number;
}) {
	if (values.length < 2)
		return <span className="inline-block" style={{ width, height }} />;
	const lo = Math.min(...values);
	const hi = Math.max(...values);
	const span = hi - lo || 1;
	const d = values
		.map((v, i) => {
			const x = (i / (values.length - 1)) * (width - 2) + 1;
			const y = height - 2 - ((v - lo) / span) * (height - 4);
			return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join("");
	return (
		<svg width={width} height={height} aria-hidden="true" className="shrink-0">
			<path
				d={d}
				fill="none"
				stroke="var(--muted-foreground)"
				strokeWidth={1.5}
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}
