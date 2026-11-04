import type { IsmsBasis, Range } from "@/lib/compliance/catalog/isms-programme";

// Zahlen im Jahresplan: höchstens eine Nachkommastelle, Spannen mit
// Halbgeviertstrich, gleiche Grenzen als eine Zahl.
const NUM = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const FTE = new Intl.NumberFormat("de-DE", {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

export function fmtNum(n: number): string {
	return NUM.format(n);
}

// Wortverbinder um den Strich: „3–5“ bricht nie um
const DASH = "\u2060–\u2060";

export function fmtRange(r: Range): string {
	return r[0] === r[1]
		? NUM.format(r[0])
		: `${NUM.format(r[0])}${DASH}${NUM.format(r[1])}`;
}

export function fmtFte(r: Range): string {
	const [a, b] = [FTE.format(r[0]), FTE.format(r[1])];
	return a === b ? a : `${a}${DASH}${b}`;
}

// Durchgänge je Jahr mal Einheiten, z. B. „4“ für quartalsweise
export function basisTimes(b: IsmsBasis): number {
	return b.perYear * (b.units ?? 1);
}
