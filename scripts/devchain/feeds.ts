import { FEEDS, type FeedKey } from "../../lib/wallet/core/feeds";
import { nowSec, RpcFault } from "./state";

// Chainlink-Nachbau für die Testkette: Runden alle 3 h seit Juli 2025, Kurs
// als ruhige Wellen um einen Grundwert (deterministisch, damit Verläufe
// stabil bleiben). Adressen = Sepolia-Feeds aus lib/wallet/core/feeds.ts.

const FEED_T0 = Date.UTC(2025, 6, 1) / 1000;
const FEED_STEP = 3 * 3600;
const FEED_SHAPE: Record<FeedKey, { base: number; amp: number }> = {
	"BTC/USD": { base: 64_000, amp: 0.18 },
	"ETH/USD": { base: 2_600, amp: 0.22 },
	"USDC/USD": { base: 1, amp: 0.0006 },
	"EUR/USD": { base: 1.085, amp: 0.025 },
};

export const FEED_BY_ADDRESS = new Map(
	(FEEDS.ethereum_sepolia ?? []).map(
		(f) => [f.address.toLowerCase(), f] as const,
	),
);

const word = (v: bigint) =>
	(v < 0n ? (1n << 256n) + v : v).toString(16).padStart(64, "0");

function feedAnswer(key: FeedKey, t: number): bigint {
	const { base, amp } = FEED_SHAPE[key];
	const d = 86_400;
	const x =
		1 +
		amp * Math.sin((2 * Math.PI * t) / (90 * d)) +
		(amp / 3) * Math.sin((2 * Math.PI * t) / (11 * d)) +
		(amp / 12) * Math.sin((2 * Math.PI * t) / (17 * 3600));
	return BigInt(Math.round(base * x * 1e8));
}

function feedRound(key: FeedKey, n: number): string {
	const t = FEED_T0 + n * FEED_STEP;
	const id = (1n << 64n) | BigInt(n);
	return `0x${word(id)}${word(feedAnswer(key, t))}${word(BigInt(t))}${word(BigInt(t))}${word(id)}`;
}

// decimals(), description(), latestRoundData(), getRoundData(id)
export function feedCall(
	key: FeedKey,
	description: string,
	data: string,
): string {
	const latest = Math.floor((nowSec() - FEED_T0) / FEED_STEP);
	if (data === "0x313ce567") return `0x${word(8n)}`;
	if (data === "0x7284e416") {
		const hex = Buffer.from(description, "utf8").toString("hex");
		return `0x${word(32n)}${word(BigInt(description.length))}${hex.padEnd(64, "0")}`;
	}
	if (data === "0xfeaf968c") return feedRound(key, latest);
	if (data.startsWith("0x9a6fc8f5")) {
		const id = BigInt(`0x${data.slice(10)}`);
		const n = Number(id & ((1n << 64n) - 1n));
		if (id >> 64n !== 1n || n < 1 || n > latest)
			throw new RpcFault(-32000, "execution reverted: No data present");
		return feedRound(key, n);
	}
	throw new RpcFault(-32000, "execution reverted");
}
