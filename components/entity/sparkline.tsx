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
	const step = width / (points.length - 1);
	const y = (v: number) =>
		height - (Math.min(max, Math.max(0, v)) / max) * (height - 2) - 1;
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
			<path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
			<circle
				cx={width}
				cy={y(points[points.length - 1] ?? 0)}
				r="2"
				fill="currentColor"
			/>
		</svg>
	);
}
