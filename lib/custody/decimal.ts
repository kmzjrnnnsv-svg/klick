// Dezimalbeträge für Kryptowerte ohne Float: als BigInt mit 18
// Nachkommastellen (Ether-Genauigkeit; Bitcoin braucht 8). Eingabe mit Punkt
// oder Komma, ohne Tausendertrennzeichen.

export const SCALE = 18;
const FACTOR = 10n ** BigInt(SCALE);
const PATTERN = /^(-)?(\d{1,24})(?:[.,](\d{1,18}))?$/;

export function isDecimal(raw: string): boolean {
	return PATTERN.test(raw.trim());
}

export function parseDecimal(raw: string): bigint {
	const m = PATTERN.exec(raw.trim());
	if (!m) throw new Error(`Kein Dezimalbetrag: ${raw}`);
	const [, sign, int, frac = ""] = m;
	const v = BigInt(int as string) * FACTOR + BigInt(frac.padEnd(SCALE, "0"));
	return sign ? -v : v;
}

export function formatDecimal(v: bigint): string {
	const neg = v < 0n;
	const abs = neg ? -v : v;
	const int = abs / FACTOR;
	const frac = (abs % FACTOR)
		.toString()
		.padStart(SCALE, "0")
		.replace(/0+$/, "");
	return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

export const absDecimal = (v: bigint): bigint => (v < 0n ? -v : v);
