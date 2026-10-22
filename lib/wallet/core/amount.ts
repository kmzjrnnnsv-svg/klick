// Beträge in Basiseinheiten (Satoshi, Wei, Token-Einheiten) als BigInt —
// nie Float. Eingaben mit mehr Nachkommastellen, als das Asset kennt, werden
// abgelehnt statt gerundet.

const PATTERN = /^(\d{1,30})(?:[.,](\d{1,36}))?$/;

export class AmountError extends Error {
	constructor(readonly code: "format" | "precision" | "zero") {
		super(code);
	}
}

export function isAmount(raw: string, decimals: number): boolean {
	try {
		parseAmount(raw, decimals);
		return true;
	} catch {
		return false;
	}
}

// „0,5“ / „0.5“ → 50_000_000n bei 8 Stellen. Leerzeichen und
// Tausenderpunkte sind nicht erlaubt (eindeutig statt raten).
export function parseAmount(
	raw: string,
	decimals: number,
	opts: { allowZero?: boolean } = {},
): bigint {
	const m = PATTERN.exec(raw.trim());
	if (!m) throw new AmountError("format");
	const whole = m[1] as string;
	const frac = m[2] ?? "";
	if (frac.length > decimals) throw new AmountError("precision");
	const value =
		BigInt(whole) * 10n ** BigInt(decimals) +
		BigInt(frac.padEnd(decimals, "0") || "0");
	if (value === 0n && !opts.allowZero) throw new AmountError("zero");
	return value;
}

// 50_000_000n, 8 → „0.5“ (kanonisch, Punkt, ohne Nullen am Ende)
export function formatAmount(base: bigint, decimals: number): string {
	const neg = base < 0n;
	const abs = neg ? -base : base;
	const unit = 10n ** BigInt(decimals);
	const whole = abs / unit;
	const frac = (abs % unit)
		.toString()
		.padStart(decimals, "0")
		.replace(/0+$/, "");
	return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

// Anzeige auf Deutsch: Tausenderpunkte, Komma, höchstens `maxFraction`
// Nachkommastellen (abgeschnitten, nicht gerundet — ein Saldo wird nie
// größer angezeigt, als er ist).
export function formatAmountDe(
	base: bigint,
	decimals: number,
	maxFraction = 8,
): string {
	const canonical = formatAmount(base, decimals);
	const neg = canonical.startsWith("-");
	const [w, f = ""] = (neg ? canonical.slice(1) : canonical).split(".");
	const whole = (w as string).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	const frac = f.slice(0, maxFraction).replace(/0+$/, "");
	return `${neg ? "-" : ""}${whole}${frac ? `,${frac}` : ""}`;
}

// Basiseinheiten zwischen Assets mit gleicher Skala nie mischen: Summe nur
// über Werte desselben Assets.
export const sumAmounts = (values: readonly bigint[]) =>
	values.reduce((a, b) => a + b, 0n);
