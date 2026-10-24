// Kleine Verlaufskurve (SVG, serverseitig) — z. B. Abdeckung der letzten 30 Tage.
export function Sparkline({
	points,
	width = 120,
	height = 28,
	max = 100,
	title,
}: {
	points: readonly number[];
	width?: number;
	height?: number;
	max?: number;
	title?: string;
}) {
	if (points.length < 2) return null;
	// Platz für den Endpunkt (r = 3) rechts
	const step = (width - 3) / (points.length - 1);
	const y = (v: number) =>
		height - (Math.min(max, Math.max(0, v)) / max) * (height - 6) - 3;
	const d = points
		.map(
			(v, i) =>
				`${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`,
		)
		.join(" ");
	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={title ?? "Verlauf"}
			className="text-primary"
		>
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle
				cx={width - 3}
				cy={y(points[points.length - 1] ?? 0)}
				r="3"
				fill="currentColor"
			/>
		</svg>
	);
}
