import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { globalDb } from "@/db";
import { priceTicks } from "@/db/schema";
import type { FeedKey } from "@/lib/wallet/core/feeds";
import type { WalletNetwork } from "@/lib/wallet/core/networks";
import { type Tick, toScale } from "@/lib/wallet/prices";

// Kurse (Plattform-Tabelle ohne RLS): Schreiben nur der Job price-tick,
// Lesen der Wallet-Bereich. Echtes Netz vor Testnetz, wenn beide da sind.

export type TickRow = {
	feed: FeedKey;
	network: WalletNetwork;
	roundId: bigint;
	answer: bigint;
	decimals: number;
	updatedAt: Date;
};

export async function insertTicks(rows: readonly TickRow[]): Promise<number> {
	if (rows.length === 0) return 0;
	const res = await globalDb
		.insert(priceTicks)
		.values(
			rows.map((r) => ({
				feed: r.feed,
				network: r.network,
				roundId: r.roundId.toString(),
				answer: r.answer.toString(),
				decimals: r.decimals,
				updatedAt: r.updatedAt,
			})),
		)
		.onConflictDoNothing()
		.returning({ id: priceTicks.id });
	return res.length;
}

// Älteste bekannte Runde je Feed (für das Rückwärts-Auffüllen)
export async function oldestTick(feed: FeedKey, network: WalletNetwork) {
	const [row] = await globalDb
		.select({ roundId: priceTicks.roundId, updatedAt: priceTicks.updatedAt })
		.from(priceTicks)
		.where(and(eq(priceTicks.feed, feed), eq(priceTicks.network, network)))
		.orderBy(asc(priceTicks.updatedAt))
		.limit(1);
	return row
		? { roundId: BigInt(row.roundId), updatedAt: row.updatedAt }
		: null;
}

// Netz, dessen Kurse gelten: echtes Netz, sobald es Kurse liefert
export async function priceNetwork(): Promise<WalletNetwork | null> {
	const first = (network?: WalletNetwork) =>
		globalDb
			.select({ network: priceTicks.network })
			.from(priceTicks)
			.where(network ? eq(priceTicks.network, network) : undefined)
			.limit(1);
	const [main] = await first("ethereum_mainnet");
	if (main) return main.network;
	const [any] = await first();
	return any?.network ?? null;
}

export async function loadTicks(
	feeds: readonly FeedKey[],
	since: Date,
	network?: WalletNetwork | null,
): Promise<Partial<Record<FeedKey, Tick[]>>> {
	const net = network ?? (await priceNetwork());
	if (!net || feeds.length === 0) return {};
	const rows = await globalDb
		.select({
			feed: priceTicks.feed,
			answer: priceTicks.answer,
			decimals: priceTicks.decimals,
			updatedAt: priceTicks.updatedAt,
		})
		.from(priceTicks)
		.where(
			and(
				eq(priceTicks.network, net),
				inArray(priceTicks.feed, [...feeds]),
				gte(priceTicks.updatedAt, since),
			),
		)
		.orderBy(asc(priceTicks.updatedAt));
	// je Feed auch den letzten Stand VOR `since` (Startwert der Reihe)
	const out: Partial<Record<FeedKey, Tick[]>> = {};
	for (const f of feeds) {
		const [before] = await globalDb
			.select({
				answer: priceTicks.answer,
				decimals: priceTicks.decimals,
				updatedAt: priceTicks.updatedAt,
			})
			.from(priceTicks)
			.where(
				and(
					eq(priceTicks.network, net),
					eq(priceTicks.feed, f),
					lt(priceTicks.updatedAt, since),
				),
			)
			.orderBy(desc(priceTicks.updatedAt))
			.limit(1);
		const list = rows
			.filter((r) => r.feed === f)
			.map((r) => ({
				at: r.updatedAt,
				value: toScale(BigInt(r.answer), r.decimals),
			}));
		if (before)
			list.unshift({
				at: before.updatedAt,
				value: toScale(BigInt(before.answer), before.decimals),
			});
		out[f] = list;
	}
	return out;
}
