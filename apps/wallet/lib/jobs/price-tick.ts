import { insertTicks, oldestTick, type TickRow } from "@wallet/lib/db/prices";
import {
	type NodeClients,
	nodeClientsFromEnv,
} from "@wallet/lib/wallet/node-clients";
import { logger } from "@/lib/log";
import { FEED_CALLS, FEEDS, type Feed } from "@/lib/wallet/core/feeds";
import type { WalletNetwork } from "@/lib/wallet/core/networks";
import {
	aggregatorRound,
	decodeAbiString,
	decodeRoundData,
	encodeGetRoundData,
} from "@/lib/wallet/prices";
import type { EthereumRpc } from "@/lib/wallet/rpc/ethereum";

// Job price-tick (jede Minute, Queue singleton): aktuelle Runde je
// Chainlink-Feed über den eigenen Ethereum-Knoten lesen und speichern; in
// jedem Lauf zusätzlich bis zu BACKFILL Runden rückwärts (Verlauf bis ein
// Jahr). Echtes Netz vor Sepolia. Ein Feed, dessen description() nicht
// stimmt, wird übergangen (falsche Adresse ⇒ kein Kurs statt falscher Kurs).

const BACKFILL = 120;
const HISTORY_MS = 400 * 86_400_000;

export async function runPriceTick(
	opts: { clients?: NodeClients; now?: Date } = {},
): Promise<{
	network: WalletNetwork | null;
	inserted: number;
	skipped: string[];
}> {
	const clients = opts.clients ?? nodeClientsFromEnv();
	const network: WalletNetwork | null = clients.ethereum_mainnet
		? "ethereum_mainnet"
		: clients.ethereum_sepolia
			? "ethereum_sepolia"
			: null;
	const client = network ? clients[network] : undefined;
	if (!network || !client || client.chain !== "ethereum")
		return { network: null, inserted: 0, skipped: [] };
	const now = opts.now ?? new Date();
	let inserted = 0;
	const skipped: string[] = [];
	for (const feed of FEEDS[network] ?? []) {
		try {
			inserted += await tickFeed(client.eth, network, feed, now);
		} catch (e) {
			skipped.push(feed.key);
			logger.warn({ feed: feed.key, network, err: e }, "price tick failed");
		}
	}
	return { network, inserted, skipped };
}

async function tickFeed(
	rpc: EthereumRpc,
	network: WalletNetwork,
	feed: Feed,
	now: Date,
): Promise<number> {
	const [desc, dec, latest] = await rpc.batch<string>(
		[
			FEED_CALLS.description,
			FEED_CALLS.decimals,
			FEED_CALLS.latestRoundData,
		].map((data) => ({
			method: "eth_call",
			params: [{ to: feed.address, data }, "latest"],
		})),
	);
	const description = decodeAbiString(desc ?? "");
	if (description !== feed.description)
		throw new Error(`description „${description}“ ≠ „${feed.description}“`);
	const decimals = Number.parseInt((dec ?? "0x").slice(2) || "0", 16);
	const round = decodeRoundData(latest ?? "");
	const rows: TickRow[] = [];
	const row = (
		r: NonNullable<ReturnType<typeof decodeRoundData>>,
	): TickRow => ({
		feed: feed.key,
		network,
		roundId: r.roundId,
		answer: r.answer,
		decimals,
		updatedAt: new Date(r.updatedAt * 1000),
	});
	if (round) rows.push(row(round));

	// Rückwärts auffüllen (innerhalb der Phase der ältesten bekannten Runde)
	const oldest =
		(await oldestTick(feed.key, network)) ??
		(round
			? { roundId: round.roundId, updatedAt: new Date(round.updatedAt * 1000) }
			: null);
	if (oldest && +now - +oldest.updatedAt < HISTORY_MS) {
		const ids: bigint[] = [];
		for (let i = 1n; i <= BigInt(BACKFILL); i += 1n) {
			if (aggregatorRound(oldest.roundId) - i < 1n) break;
			ids.push(oldest.roundId - i);
		}
		const answers = await rpc.batchSettled<string>(
			ids.map((id) => ({
				method: "eth_call",
				params: [{ to: feed.address, data: encodeGetRoundData(id) }, "latest"],
			})),
		);
		for (const a of answers) {
			const r = a.ok ? decodeRoundData(a.result) : null;
			if (r) rows.push(row(r));
		}
	}
	return insertTicks(rows);
}
