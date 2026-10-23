import type { WalletNetwork } from "./networks";

// Chainlink-Preisfeeds, gelesen über den EIGENEN Ethereum-Knoten (kein
// Kurs-Dienstleister). Sepolia-Feeds folgen echten Kursen. Die USD-Feeds
// haben 8 Nachkommastellen; Euro-Kurse entstehen als Kreuzkurs über EUR/USD.
//
// PRÜFEN vor Nutzung: Adressen gegen docs.chain.link („Price Feed
// Addresses“). Der Job prüft zusätzlich description() je Feed und übergeht
// einen Feed, dessen Beschreibung nicht passt — eine falsche Adresse liefert
// also nie einen falschen Kurs, nur keinen.

export type FeedKey = "BTC/USD" | "ETH/USD" | "USDC/USD" | "EUR/USD";

export type Feed = {
	key: FeedKey;
	address: `0x${string}`;
	// erwartete description() des Aggregators
	description: string;
};

export const FEEDS: Partial<Record<WalletNetwork, readonly Feed[]>> = {
	ethereum_sepolia: [
		{
			key: "BTC/USD",
			address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
			description: "BTC / USD",
		},
		{
			key: "ETH/USD",
			address: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
			description: "ETH / USD",
		},
		{
			key: "USDC/USD",
			address: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
			description: "USDC / USD",
		},
		{
			key: "EUR/USD",
			address: "0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910",
			description: "EUR / USD",
		},
	],
	ethereum_mainnet: [
		{
			key: "BTC/USD",
			address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
			description: "BTC / USD",
		},
		{
			key: "ETH/USD",
			address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
			description: "ETH / USD",
		},
		{
			key: "USDC/USD",
			address: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
			description: "USDC / USD",
		},
		{
			key: "EUR/USD",
			address: "0xb49f677943BC038e9857d61E7d053CaA2C1734C1",
			description: "EUR / USD",
		},
	],
};

// Paare, die die Watchlist anbietet. EURC hat keinen eigenen Feed und wird
// zum Nennwert (1 EURC = 1 EUR) gezeigt — als Annahme gekennzeichnet.
export const PAIRS = [
	"BTC/EUR",
	"ETH/EUR",
	"USDC/EUR",
	"BTC/USD",
	"ETH/USD",
	"EUR/USD",
] as const;
export type Pair = (typeof PAIRS)[number];
export const DEFAULT_WATCHLIST: readonly Pair[] = [
	"BTC/EUR",
	"ETH/EUR",
	"USDC/EUR",
];

export const isPair = (v: string): v is Pair =>
	(PAIRS as readonly string[]).includes(v);

// Feeds, aus denen ein Paar entsteht: direkt (X/USD) oder Kreuzkurs X/EUR =
// X/USD ÷ EUR/USD
export function feedsOfPair(pair: Pair): {
	base: FeedKey;
	divisor: FeedKey | null;
} {
	const [asset, quote] = pair.split("/") as [string, string];
	if (quote === "USD")
		return { base: `${asset}/USD` as FeedKey, divisor: null };
	return { base: `${asset}/USD` as FeedKey, divisor: "EUR/USD" };
}

// Funktions-Selektoren des Chainlink-Aggregators (AggregatorV3Interface)
export const FEED_CALLS = {
	decimals: "0x313ce567",
	description: "0x7284e416",
	latestRoundData: "0xfeaf968c",
	getRoundData: "0x9a6fc8f5",
} as const;
