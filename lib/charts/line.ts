// Liniendiagramm (pure, Test `charts-line`): Punkte in Koordinaten eines
// SVG mit festem viewBox. Werte 0…max, Zeit auf der x-Achse gleichmäßig nach
// Datum (nicht nach Index), damit Lücken sichtbar bleiben.

export type LinePoint = { date: string; value: number };

export type LineGeometry = {
	d: string;
	coords: { x: number; y: number; date: string; value: number }[];
};

const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export function lineGeometry(
	points: readonly LinePoint[],
	box: { width: number; height: number; pad: number },
	range: { start: string; end: string; max?: number },
): LineGeometry {
	const max = range.max ?? 100;
	const t0 = ms(range.start);
	const span = Math.max(1, ms(range.end) - t0);
	const w = box.width - 2 * box.pad;
	const h = box.height - 2 * box.pad;
	const coords = points.map((p) => {
		const fx = Math.min(1, Math.max(0, (ms(p.date) - t0) / span));
		const fy = Math.min(1, Math.max(0, p.value / max));
		return {
			x: Math.round((box.pad + fx * w) * 10) / 10,
			y: Math.round((box.pad + (1 - fy) * h) * 10) / 10,
			date: p.date,
			value: p.value,
		};
	});
	const d = coords
		.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`)
		.join(" ");
	return { d, coords };
}

/** Index des Punkts, dessen x am nächsten an `x` liegt (für das Fadenkreuz) */
export function nearestIndex(
	coords: readonly { x: number }[],
	x: number,
): number {
	let best = -1;
	let dist = Number.POSITIVE_INFINITY;
	coords.forEach((c, i) => {
		const dx = Math.abs(c.x - x);
		if (dx < dist) {
			dist = dx;
			best = i;
		}
	});
	return best;
}
