import { FEED_CALLS, type FeedKey, feedsOfPair, type Pair } from "./core/feeds";

// Kurse aus Chainlink-Runden (rein, getestet): ABI dekodieren, Kreuzkurse
// ohne Float, Reihen für den Kursverlauf, Kurs zu einem Zeitpunkt.
// Interne Skala: 8 Nachkommastellen (wie die USD-Feeds).

export const PRICE_DECIMALS = 8;
const SCALE = 10n ** BigInt(PRICE_DECIMALS);

const word = (hex: string, i: number) =>
	hex.slice(2 + i * 64, 2 + (i + 1) * 64);

function int256(w: string): bigint {
	const v = BigInt(`0x${w}`);
	return v >= 1n << 255n ? v - (1n << 256n) : v;
}

export type RoundData = {
	roundId: bigint;
	answer: bigint;
	updatedAt: number; // Sekunden
};

export function decodeRoundData(hex: string): RoundData | null {
	if (!/^0x[0-9a-fA-F]{320,}$/.test(hex)) return null;
	const roundId = BigInt(`0x${word(hex, 0)}`);
	const answer = int256(word(hex, 1));
	const updatedAt = Number(BigInt(`0x${word(hex, 3)}`));
	if (updatedAt === 0 || answer <= 0n) return null; // unvollständige Runde
	return { roundId, answer, updatedAt };
}

export const encodeGetRoundData = (roundId: bigint) =>
	`${FEED_CALLS.getRoundData}${roundId.toString(16).padStart(64, "0")}`;

// ABI-kodierter String (description(), symbol())
export function decodeAbiString(hex: string): string {
	const data = hex.replace(/^0x/, "");
	if (data.length < 128) return "";
	const len = Number.parseInt(data.slice(64, 128), 16);
	return Buffer.from(data.slice(128, 128 + len * 2), "hex").toString("utf8");
}

// Runden-ID eines Aggregator-Proxys: (phaseId << 64) | runde in der Phase
export const phaseOf = (roundId: bigint) => roundId >> 64n;
export const aggregatorRound = (roundId: bigint) =>
	roundId & ((1n << 64n) - 1n);

// Wert auf 8 Stellen bringen
export function toScale(answer: bigint, decimals: number): bigint {
	if (decimals === PRICE_DECIMALS) return answer;
	return decimals > PRICE_DECIMALS
		? answer / 10n ** BigInt(decimals - PRICE_DECIMALS)
		: answer * 10n ** BigInt(PRICE_DECIMALS - decimals);
}

export type Tick = { at: Date; value: bigint }; // value: 8 Stellen

// Paar als Reihe: X/USD direkt, X/EUR = X/USD ÷ EUR/USD (letzter EUR/USD-
// Stand zum Zeitpunkt). Ergebnis zeitlich aufsteigend.
export function pairSeries(
	pair: Pair,
	ticks: Partial<Record<FeedKey, readonly Tick[]>>,
): Tick[] {
	const { base, divisor } = feedsOfPair(pair);
	const b = [...(ticks[base] ?? [])].sort((x, y) => +x.at - +y.at);
	if (!divisor) return b;
	const d = [...(ticks[divisor] ?? [])].sort((x, y) => +x.at - +y.at);
	if (d.length === 0) return [];
	const out: Tick[] = [];
	let j = 0;
	for (const t of b) {
		while (j + 1 < d.length && +(d[j + 1] as Tick).at <= +t.at) j += 1;
		const div = d[j] as Tick;
		if (+div.at > +t.at && j === 0) continue; // noch kein Teiler bekannt
		out.push({ at: t.at, value: (t.value * SCALE) / div.value });
	}
	return out;
}

// Kurs zu einem Zeitpunkt: letzter Punkt davor (Stufenfunktion)
export function priceAt(series: readonly Tick[], at: Date): bigint | null {
	let best: Tick | null = null;
	for (const t of series) {
		if (+t.at <= +at) best = t;
		else break;
	}
	return best?.value ?? null;
}

// Veränderung in Basispunkten (1 % = 100) gegenüber `since`
export function changeBp(series: readonly Tick[], since: Date): number | null {
	const now = series[series.length - 1];
	const then = priceAt(series, since) ?? series[0]?.value;
	if (!now || !then || then === 0n) return null;
	return Number(((now.value - then) * 10_000n) / then);
}

// Wert einer Menge (Basiseinheiten, `decimals`) zum Kurs (8 Stellen) → 8 Stellen
export function amountValue(
	amount: bigint,
	decimals: number,
	price: bigint,
): bigint {
	return (amount * price) / 10n ** BigInt(decimals);
}

// „64.123,45“ — Kurs/Wert mit 8 Stellen auf `fraction` Stellen gekürzt
export function formatScaled(v: bigint, fraction = 2): string {
	const neg = v < 0n;
	const abs = neg ? -v : v;
	const unit = 10n ** BigInt(PRICE_DECIMALS - fraction);
	const rounded = (abs + unit / 2n) / unit; // kaufmännisch runden
	const s = rounded.toString().padStart(fraction + 1, "0");
	const whole = s
		.slice(0, s.length - fraction)
		.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
	const frac = s.slice(s.length - fraction);
	return `${neg ? "-" : ""}${whole}${fraction > 0 ? `,${frac}` : ""}`;
}

// Für Diagramme: Wert als Zahl (nur Darstellung, nie für Rechnungen)
export const toNumber = (v: bigint) => Number(v) / Number(SCALE);
