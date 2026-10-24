import { loadTicks } from "@wallet/lib/db/prices";
import { type AssetCode, assetOf } from "@/lib/wallet/core/assets";
import {
	DEFAULT_WATCHLIST,
	type FeedKey,
	feedsOfPair,
	isPair,
	PAIRS,
	type Pair,
} from "@/lib/wallet/core/feeds";
import type { WalletNetwork } from "@/lib/wallet/core/networks";
import {
	amountValue,
	changeBp,
	pairSeries,
	type Tick,
	toNumber,
} from "@/lib/wallet/prices";

// Markt-Sicht des Wallet-Bereichs: Watchlist-Kurse, Verlauf je Paar, Wert
// der Bestände in Euro. Kurse kommen aus price_ticks (Job price-tick).

export const RANGES = {
	"1t": { label: "1 T", ms: 86_400_000 },
	"1w": { label: "1 W", ms: 7 * 86_400_000 },
	"1m": { label: "1 M", ms: 30 * 86_400_000 },
	"1j": { label: "1 J", ms: 365 * 86_400_000 },
	alles: { label: "Alles", ms: null },
} as const;
export type RangeKey = keyof typeof RANGES;
export const isRange = (v: unknown): v is RangeKey =>
	typeof v === "string" && v in RANGES;

export const pairSlug = (p: Pair) => p.toLowerCase().replace("/", "-");
export function pairFromSlug(slug: string): Pair | null {
	const p = slug.toUpperCase().replace("-", "/");
	return isPair(p) ? p : null;
}

export function cleanWatchlist(
	raw: readonly string[] | null | undefined,
): Pair[] {
	const list = (raw ?? []).filter(isPair);
	return list.length > 0 ? [...new Set(list)] : [...DEFAULT_WATCHLIST];
}

const feedsFor = (pairs: readonly Pair[]): FeedKey[] => [
	...new Set(
		pairs.flatMap((p) => {
			const f = feedsOfPair(p);
			return f.divisor ? [f.base, f.divisor] : [f.base];
		}),
	),
];

export async function loadPairSeries(pair: Pair, since: Date): Promise<Tick[]> {
	return pairSeries(pair, await loadTicks(feedsFor([pair]), since));
}

export type Quote = {
	pair: Pair;
	price: bigint | null;
	changeBp: number | null; // gegenüber vor 24 h
	spark: number[]; // 7 Tage, nur zur Darstellung
	at: Date | null;
};

export async function watchlistQuotes(
	pairs: readonly Pair[],
	now = new Date(),
): Promise<Quote[]> {
	const ticks = await loadTicks(
		feedsFor(pairs),
		new Date(+now - 7 * 86_400_000),
	);
	return pairs.map((pair) => {
		const s = pairSeries(pair, ticks);
		const last = s[s.length - 1];
		const step = Math.max(1, Math.floor(s.length / 48));
		return {
			pair,
			price: last?.value ?? null,
			changeBp: changeBp(s, new Date(+now - 86_400_000)),
			spark: s
				.filter((_, i) => i % step === 0 || i === s.length - 1)
				.map((t) => toNumber(t.value)),
			at: last?.at ?? null,
		};
	});
}

// Euro-Kurs je Asset (aktuell). EURC zum Nennwert — als Annahme markiert.
export async function euroPrices(): Promise<{
	prices: Partial<Record<AssetCode, bigint>>;
	assumedPar: AssetCode[];
	at: Date | null;
}> {
	const quotes = await watchlistQuotes(["BTC/EUR", "ETH/EUR", "USDC/EUR"]);
	const prices: Partial<Record<AssetCode, bigint>> = { EURC: 100_000_000n };
	let at: Date | null = null;
	for (const q of quotes) {
		if (!q.price) continue;
		prices[q.pair.split("/")[0] as AssetCode] = q.price;
		if (q.at && (!at || +q.at > +at)) at = q.at;
	}
	return { prices, assumedPar: ["EURC"], at };
}

// Wert einer Menge in Euro (8 Stellen) oder null ohne Kurs
export function euroValue(
	network: WalletNetwork,
	asset: AssetCode,
	amount: bigint,
	prices: Partial<Record<AssetCode, bigint>>,
): bigint | null {
	const price = prices[asset];
	const decimals = assetOf(network, asset)?.decimals;
	if (!price || decimals === undefined) return null;
	return amountValue(amount, decimals, price);
}

export const allPairs = PAIRS;
