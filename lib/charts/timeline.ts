// Zeitleiste (pure, Test `charts-timeline`): Lage eines Datums zwischen
// Beginn und Ende als Anteil 0…1 und Monatsanfänge als Teilstriche. Daten
// sind ISO-Tage (YYYY-MM-DD), gerechnet in UTC, damit Sommerzeit nichts
// verschiebt.

import type { Tone } from "./ring";

// Ein Termin auf der Zeitleiste (components/charts/timeline.tsx)
export type TimelineItem = {
	key: string;
	date: string;
	label: string;
	detail?: string;
	tone: Tone;
	href?: string;
};

const DAY = 86_400_000;
const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

export function addDays(day: string, n: number): string {
	return new Date(ms(day) + n * DAY).toISOString().slice(0, 10);
}

/** Anteil zwischen Beginn und Ende, begrenzt auf 0…1 */
export function timelinePosition(
	start: string,
	end: string,
	date: string,
): number {
	const span = ms(end) - ms(start);
	if (!(span > 0)) return 0;
	return Math.min(1, Math.max(0, (ms(date) - ms(start)) / span));
}

/** Monatsanfänge im Bereich (ohne den Beginn selbst) */
export function monthTicks(
	start: string,
	end: string,
): { date: string; position: number }[] {
	const out: { date: string; position: number }[] = [];
	const s = new Date(ms(start));
	let y = s.getUTCFullYear();
	let m = s.getUTCMonth() + 1;
	for (let i = 0; i < 60; i += 1) {
		if (m > 11) {
			y += 1;
			m = 0;
		}
		const date = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
		if (date > end) break;
		out.push({ date, position: timelinePosition(start, end, date) });
		m += 1;
	}
	return out;
}
