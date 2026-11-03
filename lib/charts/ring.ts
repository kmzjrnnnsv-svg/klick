// Ringe und Donuts (pure, Test `charts-ring`): Anteile als Bruchteile des
// Umfangs. Gezeichnet wird in `components/ui/ring.tsx` über stroke-dasharray;
// zwischen Segmenten bleibt eine kleine Lücke (2 px bei r = 40), damit die
// Teile auch ohne Farbe unterscheidbar sind.

// Farbe eines Teils, aus den Tokens (styles/tokens.css)
export type Tone =
	| "primary"
	| "success"
	| "warning"
	| "destructive"
	| "muted"
	| "chart-1"
	| "chart-2"
	| "chart-3"
	| "chart-4"
	| "chart-5";

export type DonutPart = { key: string; value: number };

export type DonutArc = {
	key: string;
	value: number;
	// Anteil am Ganzen (0…1)
	share: number;
	// Beginn und Länge als Bruchteil des Umfangs (0…1), Lücke schon abgezogen
	start: number;
	length: number;
};

/** Prozent ganzzahlig; ohne Nenner 0 */
export function percent(part: number, whole: number): number {
	if (!(whole > 0)) return 0;
	return Math.round((Math.max(0, part) / whole) * 100);
}

/** Füllstand eines Rings (0…1), begrenzt */
export function ringFraction(value: number, max = 100): number {
	if (!(max > 0) || !Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value / max));
}

/**
 * Bögen eines Donuts. Leere Teile fallen weg; ein einzelner Teil füllt den
 * ganzen Ring ohne Lücke. `gap` ist der Abstand zwischen zwei Teilen als
 * Bruchteil des Umfangs; zu kleine Teile behalten mindestens die Hälfte
 * ihrer Länge, damit sie sichtbar bleiben.
 */
export function donutArcs(
	parts: readonly DonutPart[],
	gap = 0.008,
): DonutArc[] {
	const visible = parts.filter((p) => p.value > 0);
	const total = visible.reduce((s, p) => s + p.value, 0);
	if (total === 0) return [];
	const useGap = visible.length > 1 ? gap : 0;
	let start = 0;
	return visible.map((p) => {
		const share = p.value / total;
		const length = Math.max(share / 2, share - useGap);
		const arc = { key: p.key, value: p.value, share, start, length };
		start += share;
		return arc;
	});
}
