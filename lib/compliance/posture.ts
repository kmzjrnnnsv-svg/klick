// Posture-Verlauf — reine Ableitung aus Tages-Snapshots (lib/jobs/posture.ts
// schreibt sie): Delta über das Fenster und Punkte für die Sparkline.

export type PostureRow = { date: string; coveragePct: number | null };

export type PostureTrend = {
	latest: number | null;
	earliest: number | null;
	deltaPct: number | null;
	points: number[];
};

export function postureTrend(
	rows: readonly PostureRow[],
	now = new Date(),
	days = 30,
): PostureTrend {
	const from = new Date(now.getTime() - days * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const inRange = rows
		.filter((r) => r.date >= from && r.coveragePct !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
	const points = inRange.map((r) => r.coveragePct as number);
	const latest = points.at(-1) ?? null;
	const earliest = points[0] ?? null;
	return {
		latest,
		earliest,
		deltaPct:
			latest === null || earliest === null
				? null
				: Math.round((latest - earliest) * 10) / 10,
		points,
	};
}
