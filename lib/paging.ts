// Listen seitenweise (Leistung bei wachsenden Daten): kein Register lädt
// oder zeichnet mehr als eine Seite. Rein, getestet (tests/paging.test.ts).

export const PAGE_SIZE = 50;

export type PageQuery = Record<string, string | string[] | undefined>;

/** `?seite=` als Seitenzahl ab 1; alles andere ist Seite 1 */
export function pageParam(v: string | string[] | undefined): number {
	const raw = Array.isArray(v) ? v[0] : v;
	const n = Number(raw);
	return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export function pageWindow(page: number, size = PAGE_SIZE) {
	return { limit: size, offset: (page - 1) * size };
}

export function pageCount(total: number, size = PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / size));
}

/** Für Register, deren Zeilen schon im Speicher liegen */
export function pageSlice<T>(
	rows: readonly T[],
	page: number,
	size = PAGE_SIZE,
) {
	const last = pageCount(rows.length, size);
	const current = Math.min(page, last);
	const { offset } = pageWindow(current, size);
	return {
		rows: rows.slice(offset, offset + size),
		page: current,
		total: rows.length,
	};
}

/** Link auf eine andere Seite, übrige Filter bleiben */
export function pageHref(path: string, query: PageQuery, page: number): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (k === "seite" || v === undefined) continue;
		for (const x of Array.isArray(v) ? v : [v]) params.append(k, x);
	}
	if (page > 1) params.set("seite", String(page));
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}
