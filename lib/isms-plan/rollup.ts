import {
	ISMS_SCENARIO_B_EXTRA,
	ISMS_SECTIONS,
	ISMS_WORKDAYS,
	type IsmsBasis,
	type IsmsItem,
	type IsmsSection,
	type Range,
} from "@/lib/compliance/catalog/isms-programme";

// Rechnung zum ISMS-Jahresplan (P1, pure): Summen je Abschnitt und gesamt
// in PT je Jahr, ISB-Anteil nach Szenario A (Fachbereiche arbeiten zu) und
// B (ISB schreibt und pflegt), Stellenanteil bei 200 Arbeitstagen. Gerechnet
// wird mit Zehnteln, damit 0,5er-Schritte ohne Rundungsfehler aufgehen.

export type RollupItem = Pick<
	IsmsItem,
	"key" | "section" | "parent" | "year" | "isb"
>;

export type Totals = { year: Range; isbA: Range; isbB: Range };

export type SectionTotals = Totals & { section: IsmsSection; items: number };

export type IsmsRollup = {
	sections: SectionTotals[];
	total: Totals;
	// Mitte der Spanne je Jahr
	middle: number;
	// Stellenanteil der oder des ISB (PT ÷ Arbeitstage)
	fte: { a: Range; b: Range };
	// Szenario B: Mehraufwand für Interviews und Rückfragen in PT
	scenarioBExtra: Range;
	workdays: number;
};

const ZERO: Range = [0, 0];

function tenth(n: number): number {
	return Math.round(n * 10);
}

export function addRange(a: Range, b: Range): Range {
	return [(tenth(a[0]) + tenth(b[0])) / 10, (tenth(a[1]) + tenth(b[1])) / 10];
}

export function sumRanges(ranges: readonly Range[]): Range {
	return ranges.reduce<Range>((acc, r) => addRange(acc, r), ZERO);
}

// Aufwand je Jahr aus den Durchgängen (PT × Durchgänge × Einheiten)
export function basisYear(basis: readonly IsmsBasis[]): Range {
	return sumRanges(
		basis.map((b) => {
			const k = b.perYear * (b.units ?? 1);
			return [b.pt[0] * k, b.pt[1] * k] as Range;
		}),
	);
}

function totalsOf(items: readonly RollupItem[]): Totals {
	return {
		year: sumRanges(items.map((i) => i.year)),
		isbA: sumRanges(items.map((i) => i.isb.a)),
		isbB: sumRanges(items.map((i) => i.isb.b)),
	};
}

// Summe eines Punkts mit allen Unterpunkten (für die Anzeige im Baum)
export function itemWithChildren(
	key: string,
	items: readonly RollupItem[],
): Totals {
	const keys = new Set([key]);
	// Unterpunkte können selbst Unterpunkte haben
	let grew = true;
	while (grew) {
		grew = false;
		for (const i of items) {
			if (i.parent && keys.has(i.parent) && !keys.has(i.key)) {
				keys.add(i.key);
				grew = true;
			}
		}
	}
	return totalsOf(items.filter((i) => keys.has(i.key)));
}

function div(r: Range, by: number): Range {
	return [r[0] / by, r[1] / by];
}

export function rollupIsms(
	items: readonly RollupItem[],
	opts: { workdays?: number; scenarioBExtra?: Range } = {},
): IsmsRollup {
	const workdays = opts.workdays ?? ISMS_WORKDAYS;
	const extra = opts.scenarioBExtra ?? ISMS_SCENARIO_B_EXTRA;
	const sections = ISMS_SECTIONS.map((section) => {
		const own = items.filter((i) => i.section === section);
		return { section, items: own.length, ...totalsOf(own) };
	});
	const total = totalsOf(items);
	return {
		sections,
		total,
		middle: (tenth(total.year[0]) + tenth(total.year[1])) / 20,
		fte: { a: div(total.isbA, workdays), b: div(total.isbB, workdays) },
		scenarioBExtra: [total.isbB[0] * extra[0], total.isbB[1] * extra[1]],
		workdays,
	};
}

// Kinder je Punkt in Katalog-Reihenfolge, Wurzeln unter `null`
export function ismsTree<T extends { key: string; parent?: string }>(
	items: readonly T[],
): Map<string | null, T[]> {
	const keys = new Set(items.map((i) => i.key));
	const tree = new Map<string | null, T[]>();
	for (const i of items) {
		const at = i.parent && keys.has(i.parent) ? i.parent : null;
		const list = tree.get(at) ?? [];
		list.push(i);
		tree.set(at, list);
	}
	return tree;
}
