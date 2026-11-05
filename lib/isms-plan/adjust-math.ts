import type { IsmsBasis, Range } from "@/lib/compliance/catalog/isms-programme";

// Anpassung eines Punkts im ISMS-Jahresplan (P2b, pure, ohne Katalog —
// auch im Browser für die Vorschau im Dialog). Eigener Aufwand ersetzt die
// Vorlage; geänderte Einheiten (z. B. 12 statt 8 Risikoanalysen) rechnen
// den Aufwand der Vorlage um. Der ISB-Anteil folgt im Verhältnis der Vorlage
// und liegt nie über dem Aufwand.

export type IsmsItemAdjust = {
	// entfällt in der Org, mit Begründung
	off?: { reason: string };
	// eigener Aufwand je Jahr in PT
	year?: Range;
	// Einheiten je Durchgang (nur Punkte, deren Vorlage Einheiten zählt)
	units?: number;
};

export type IsmsNumbers = { year: Range; isbA: Range; isbB: Range };

type Template = {
	year: Range;
	isb: { a: Range; b: Range };
	basis?: readonly IsmsBasis[];
};

const r10 = (n: number) => Math.round(n * 10) / 10;

// erste Zeile der Vorlage, die Einheiten zählt
export function unitsLine(
	basis: readonly IsmsBasis[] | undefined,
): IsmsBasis | undefined {
	return basis?.find((b) => b.units !== undefined);
}

function follow(share: Range, from: Range, to: Range): Range {
	const ratio = (i: 0 | 1) => {
		const j = i === 0 ? 1 : 0;
		if (from[i] > 0) return share[i] / from[i];
		if (from[j] > 0) return share[j] / from[j];
		return 1;
	};
	const at = (i: 0 | 1) => Math.min(to[i], r10(to[i] * Math.min(ratio(i), 1)));
	return [at(0), at(1)];
}

export function adjustedNumbers(
	tpl: Template,
	adj: IsmsItemAdjust | null | undefined,
): IsmsNumbers {
	let year: Range | null = null;
	if (adj?.year) year = adj.year;
	else if (adj?.units !== undefined) {
		const line = unitsLine(tpl.basis);
		if (line?.units !== undefined) {
			const k = (adj.units - line.units) * line.perYear;
			year = [
				Math.max(0, r10(tpl.year[0] + k * line.pt[0])),
				Math.max(0, r10(tpl.year[1] + k * line.pt[1])),
			];
		}
	}
	if (!year) return { year: tpl.year, isbA: tpl.isb.a, isbB: tpl.isb.b };
	return {
		year,
		isbA: follow(tpl.isb.a, tpl.year, year),
		isbB: follow(tpl.isb.b, tpl.year, year),
	};
}
