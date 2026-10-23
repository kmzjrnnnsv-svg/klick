import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import {
	walletAccounts,
	walletAddresses,
	walletPayouts,
	walletTransfers,
} from "@/db/schema";
import type { AccountBalances, WalletAccount } from "@/db/schema/wallet";
import { audit } from "@/lib/audit";
import { loadSanctionSet } from "@/lib/db/sanctions";
import { type OrgTx, withOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import { formatAmountDe } from "@/lib/wallet/core/amount";
import { ASSETS, type AssetCode, assetOf } from "@/lib/wallet/core/assets";
import {
	type AddressBranch,
	btcDescriptors,
	deriveAddress,
	GAP_LIMIT,
	parseAccountKey,
} from "@/lib/wallet/core/derive";
import { NETWORKS } from "@/lib/wallet/core/networks";
import {
	EXPECTED_BTC_CHAIN,
	type NodeClients,
	nodeClientsFromEnv,
} from "@/lib/wallet/node-clients";
import { type BitcoinRpc, btcToSats } from "@/lib/wallet/rpc/bitcoin";
import {
	addressTopic,
	type EthereumRpc,
	type EthReceipt,
	type EthTrace,
	hexToBigInt,
	hexToNumber,
	TRANSFER_TOPIC,
} from "@/lib/wallet/rpc/ethereum";
import { RpcError } from "@/lib/wallet/rpc/http";
import {
	type SanctionSet,
	type ScreeningOutcome,
	screenSources,
} from "@/lib/wallet/screening";
import { signerCall, signerConfigured } from "@/lib/wallet/signer/client";
import { btcObservations, btcWindow } from "@/lib/wallet/sync/bitcoin";
import {
	chunks,
	ethObservations,
	ethScanRange,
	ownSentTxids,
	traceValueFlow,
} from "@/lib/wallet/sync/ethereum";
import { type ExistingTransfer, planTransfers } from "@/lib/wallet/sync/plan";
import { type TransferObservation, transferKey } from "@/lib/wallet/sync/types";

// Job wallet-sync (jede Minute, Queue „singleton“): je Org und Konto den
// eigenen Knoten lesen und die Bewegungen nachführen.
//   A  Konto, Adressen, bekannte Bewegungen lesen (Org-Kontext, kurz)
//   B  Knoten abfragen — ohne offene Transaktion
//   C  Ergebnis schreiben: Bewegungen, Adressen, Stand, Audit, Meldungen
// Fehler eines Kontos landen in `syncError`, die anderen laufen weiter.

const MAX_ETH_BLOCKS = 2000;
const TRACE_CHUNK = 100;
const LOG_CHUNK = 2000;

type AddressRow = {
	id: string;
	branch: number;
	index: number;
	address: string;
	firstSeenAt: Date | null;
};

type Prepared = {
	account: WalletAccount;
	addresses: AddressRow[];
	knownKeys: Set<string>;
	// jüngere, nicht verworfene Bewegungen — Bitcoin prüft die im offenen
	// Fenster nach, wenn der Knoten sie nicht mehr meldet
	recent: { txid: string; status: string; blockHeight: number | null }[];
};

type NodeResult = {
	observations: TransferObservation[];
	goneTxids: Set<string>;
	rescanned?: { from: number; to: number };
	screening: Map<string, ScreeningOutcome>;
	newAddresses: { branch: number; index: number; address: string }[];
	accountPatch: Partial<WalletAccount>;
};

export class WalletSyncError extends Error {
	constructor(
		readonly code: "wrong_chain" | "address_mismatch" | "import_failed",
		message: string,
	) {
		super(message);
		this.name = "WalletSyncError";
	}
}

export async function runWalletSync(
	opts: { clients?: NodeClients; sanctions?: SanctionSet; now?: Date } = {},
): Promise<{ accounts: number; failed: number }> {
	const clients = opts.clients ?? nodeClientsFromEnv();
	if (Object.keys(clients).length === 0) return { accounts: 0, failed: 0 };
	const sanctions = opts.sanctions ?? (await loadSanctionSet());
	const orgs = await globalDb
		.select({ id: organization.id })
		.from(organization);
	let accounts = 0;
	let failed = 0;
	for (const { id: orgId } of orgs) {
		const prepared = await withOrg({ orgId, userId: null }, (tx) =>
			prepare(tx, orgId),
		);
		for (const p of prepared) {
			const client = clients[p.account.network];
			if (!client) continue;
			accounts += 1;
			try {
				const result =
					client.chain === "bitcoin"
						? await readBitcoin(client.btc, p, sanctions)
						: await readEthereum(client.eth, p, sanctions);
				await withOrg({ orgId, userId: null }, (tx) =>
					apply(tx, orgId, p, result, opts.now ?? new Date()),
				);
			} catch (e) {
				failed += 1;
				const message =
					e instanceof RpcError || e instanceof WalletSyncError
						? e.message
						: "Abgleich fehlgeschlagen";
				logger.warn(
					{ orgId, accountId: p.account.id, err: e },
					"wallet sync failed",
				);
				await withOrg({ orgId, userId: null }, async (tx) => {
					await tx
						.update(walletAccounts)
						.set({ syncError: message.slice(0, 300) })
						.where(eq(walletAccounts.id, p.account.id));
					// Alarm nur beim ersten Auftreten, nicht in jedem Lauf
					if (
						e instanceof WalletSyncError &&
						e.code === "address_mismatch" &&
						p.account.syncError !== message.slice(0, 300)
					)
						await alert(tx, orgId, p.account, message);
				});
			}
		}
	}
	return { accounts, failed };
}

async function prepare(tx: OrgTx, orgId: string): Promise<Prepared[]> {
	const accounts = await tx
		.select()
		.from(walletAccounts)
		.where(
			and(
				eq(walletAccounts.organizationId, orgId),
				eq(walletAccounts.status, "active"),
			),
		);
	if (accounts.length === 0) return [];
	const ids = accounts.map((a) => a.id);
	const addresses = await tx
		.select({
			id: walletAddresses.id,
			accountId: walletAddresses.accountId,
			branch: walletAddresses.branch,
			index: walletAddresses.index,
			address: walletAddresses.address,
			firstSeenAt: walletAddresses.firstSeenAt,
		})
		.from(walletAddresses)
		.where(inArray(walletAddresses.accountId, ids));
	const since = new Date(Date.now() - 30 * 86_400_000);
	const recent = await tx
		.select({
			accountId: walletTransfers.accountId,
			txid: walletTransfers.txid,
			outputRef: walletTransfers.outputRef,
			asset: walletTransfers.asset,
			status: walletTransfers.status,
			blockHeight: walletTransfers.blockHeight,
		})
		.from(walletTransfers)
		.where(
			and(
				inArray(walletTransfers.accountId, ids),
				or(
					eq(walletTransfers.status, "pending"),
					gt(walletTransfers.firstSeenAt, since),
				),
			),
		);
	return accounts.map((account) => ({
		account,
		addresses: addresses.filter((a) => a.accountId === account.id),
		knownKeys: new Set(
			recent.filter((r) => r.accountId === account.id).map(transferKey),
		),
		recent: recent
			.filter((r) => r.accountId === account.id && r.status !== "dropped")
			.map(({ txid, status, blockHeight }) => ({ txid, status, blockHeight })),
	}));
}

// Adressen eines Zweigs lokal ableiten (Index from … to-1); Ethereum mit
// EIP-55-Prüfsumme, Vergleiche immer klein geschrieben
function deriveBranch(
	account: WalletAccount,
	branch: AddressBranch,
	from: number,
	to: number,
): string[] {
	const { hd } = parseAccountKey(account.accountKey, account.network);
	const out: string[] = [];
	for (let i = from; i < to; i += 1)
		out.push(deriveAddress(hd, account.network, branch, i));
	return out;
}

function maxUsedIndex(
	p: Prepared,
	branch: number,
	observations: readonly TransferObservation[],
): number {
	const used = new Set(
		observations.filter((o) => o.direction === "in").map((o) => o.address),
	);
	let max = -1;
	for (const a of p.addresses)
		if (
			a.branch === branch &&
			(a.firstSeenAt || used.has(a.address)) &&
			a.index > max
		)
			max = a.index;
	return max;
}

// ── Bitcoin ──────────────────────────────────────────────────────────────

async function readBitcoin(
	rpc: BitcoinRpc,
	p: Prepared,
	sanctions: SanctionSet,
): Promise<NodeResult> {
	const { account } = p;
	const info = await rpc.blockchainInfo();
	const expected = EXPECTED_BTC_CHAIN[account.network];
	if (info.chain !== expected)
		throw new WalletSyncError(
			"wrong_chain",
			`Knoten meldet Kette „${info.chain}“, erwartet „${expected}“`,
		);
	const wallet = `klick-${account.id}`;
	await rpc.ensureWatchWallet(wallet);

	// Adressbereich: alles bis zum nächsten Index + Lücke beobachten
	const needed =
		Math.max(
			account.nextReceiveIndex,
			account.nextChangeIndex,
			maxUsedIndex(p, 0, []) + 1,
			maxUsedIndex(p, 1, []) + 1,
		) + GAP_LIMIT;
	const newAddresses: NodeResult["newAddresses"] = [];
	const patch: Partial<WalletAccount> = {};
	let range = account.importedRange;
	if (!account.nodeReady || needed > account.importedRange) {
		range = Math.max(needed, account.importedRange);
		const descs = btcDescriptors(account.accountKey);
		const recv = await rpc.withChecksum(descs.receive);
		const change = await rpc.withChecksum(descs.change);
		const timestamp = Math.floor(
			(account.historyFrom ?? account.createdAt).getTime() / 1000,
		);
		const res = await rpc.importDescriptors(wallet, [
			{
				desc: recv,
				active: true,
				range: [0, range - 1],
				timestamp,
				internal: false,
			},
			{
				desc: change,
				active: true,
				range: [0, range - 1],
				timestamp,
				internal: true,
			},
		]);
		if (!res.every((r) => r.success))
			throw new WalletSyncError(
				"import_failed",
				`Descriptor-Import fehlgeschlagen: ${res.find((r) => !r.success)?.error?.message ?? "unbekannt"}`,
			);
		// Abgleich: Knoten und Klick müssen dieselben Adressen ableiten (H7)
		for (const [branch, desc] of [
			[0, recv],
			[1, change],
		] as const) {
			const node = (await rpc.deriveAddresses(desc, [0, range - 1])).map((a) =>
				a.toLowerCase(),
			);
			const local = deriveBranch(account, branch, 0, range);
			if (
				node.length !== local.length ||
				node.some((a, i) => a !== local[i]?.toLowerCase())
			)
				throw new WalletSyncError(
					"address_mismatch",
					"Knoten leitet andere Adressen ab als Klick — Konto angehalten",
				);
			const have = new Set(
				p.addresses.filter((a) => a.branch === branch).map((a) => a.index),
			);
			local.forEach((address, index) => {
				if (!have.has(index)) newAddresses.push({ branch, index, address });
			});
		}
		patch.importedRange = range;
		patch.nodeReady = true;
	}

	const ours = new Set(
		[...p.addresses, ...newAddresses].map((a) => a.address.toLowerCase()),
	);
	const finality =
		NETWORKS[account.network].finality.kind === "confirmations"
			? (NETWORKS[account.network].finality as { n: number }).n
			: 1;
	const since = await rpc.listSinceBlock(
		wallet,
		account.syncCursor,
		btcWindow(finality),
	);
	const { observations, goneTxids } = btcObservations(since, {
		ours,
		finality,
	});

	// Zahlungen im offenen Fenster (oder unbestätigt), die der Knoten nicht
	// mehr meldet: einzeln nachfragen — Reorg/Doppelausgabe macht sie ungültig
	const observed = new Set(observations.map((o) => o.txid));
	const windowFloor = info.blocks - btcWindow(finality) + 1;
	const recheck = new Set(
		p.recent
			.filter(
				(r) =>
					!observed.has(r.txid) &&
					(r.status === "pending" ||
						r.blockHeight === null ||
						r.blockHeight >= windowFloor),
			)
			.map((r) => r.txid),
	);
	for (const txid of recheck) {
		if (goneTxids.has(txid)) continue;
		try {
			const tx = await rpc.getTransaction(wallet, txid);
			if (tx.confirmations < 0) goneTxids.add(txid);
		} catch (e) {
			// „Invalid or non-wallet transaction id“: verdrängt bzw. unbekannt
			if (e instanceof RpcError && e.code === "rpc") goneTxids.add(txid);
			else throw e;
		}
	}

	// Sanktionsprüfung neuer Eingänge: Adressen der Eingänge (vin.prevout)
	const screening = new Map<string, ScreeningOutcome>();
	const sourcesByTx = new Map<string, string[]>();
	for (const o of observations) {
		if (o.direction !== "in" || p.knownKeys.has(transferKey(o))) continue;
		let sources = sourcesByTx.get(o.txid);
		if (!sources) {
			const raw = await rpc.getRawTransaction(o.txid, o.blockHash ?? undefined);
			sources = raw.vin
				.map((v) => v.prevout?.scriptPubKey?.address)
				.filter((a): a is string => !!a);
			sourcesByTx.set(o.txid, sources);
		}
		const outcome = screenSources("bitcoin", sources, sanctions);
		screening.set(transferKey(o), outcome);
		if (!o.counterparty && sources[0]) o.counterparty = sources[0];
	}

	const bal = await rpc.balances(wallet, finality);
	const after = await rpc.blockchainInfo();
	const confirmed = btcToSats(bal.confirmed);
	const total = btcToSats(bal.total);
	patch.syncCursor = since.lastblock;
	patch.balances = {
		BTC: {
			confirmed: confirmed.toString(),
			pending: (total - confirmed).toString(),
		},
	};
	patch.balanceHeight = after.blocks;
	patch.balanceHash = after.bestblockhash;
	return {
		observations,
		goneTxids,
		screening,
		newAddresses,
		accountPatch: patch,
	};
}

// ── Ethereum ─────────────────────────────────────────────────────────────

async function findBlockByTime(
	rpc: EthereumRpc,
	time: Date,
	latest: number,
): Promise<number> {
	const target = Math.floor(time.getTime() / 1000);
	let lo = 0;
	let hi = latest;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		const b = await rpc.block(mid);
		if (!b || hexToNumber(b.timestamp) < target) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

async function readEthereum(
	rpc: EthereumRpc,
	p: Prepared,
	sanctions: SanctionSet,
): Promise<NodeResult> {
	const { account } = p;
	const net = NETWORKS[account.network];
	const chainId = await rpc.chainId();
	if (chainId !== net.chainId)
		throw new WalletSyncError(
			"wrong_chain",
			`Knoten meldet chainId ${chainId}, erwartet ${net.chainId}`,
		);
	const [latest, finalized] = await Promise.all([
		rpc.block("latest"),
		rpc.block("finalized"),
	]);
	if (!latest || !finalized)
		throw new RpcError("parse", "Knoten liefert keinen latest/finalized-Block");
	const latestHeight = hexToNumber(latest.number);
	const finalizedHeight = hexToNumber(finalized.number);

	const patch: Partial<WalletAccount> = { nodeReady: true };
	const newAddresses: NodeResult["newAddresses"] = [];
	// Ethereum: eine Adresse je Konto (Kontomodell) — Index 0
	if (!p.addresses.some((a) => a.branch === 0 && a.index === 0))
		newAddresses.push({
			branch: 0,
			index: 0,
			address: deriveBranch(account, 0, 0, 1)[0] as string,
		});
	const ours = new Set(
		[...p.addresses, ...newAddresses].map((a) => a.address.toLowerCase()),
	);
	const addrs = [...ours];

	let startHeight = account.startHeight;
	if (startHeight === null) {
		startHeight = await findBlockByTime(
			rpc,
			account.historyFrom ?? account.createdAt,
			latestHeight,
		);
		patch.startHeight = startHeight;
	}
	const range = ethScanRange({
		syncHeight: account.syncHeight,
		startHeight,
		finalizedHeight,
		latestHeight,
		maxBlocks: MAX_ETH_BLOCKS,
	});

	const tokens = new Map(
		ASSETS[account.network]
			.filter((a) => a.contract)
			.map((a) => [(a.contract as string).toLowerCase(), a] as const),
	);
	let observations: TransferObservation[] = [];
	if (range) {
		const traceCalls = chunks(range.from, range.to, TRACE_CHUNK).flatMap(
			([from, to]) => [
				{
					method: "trace_filter",
					params: [
						{ fromBlock: hex(from), toBlock: hex(to), toAddress: addrs },
					],
				},
				{
					method: "trace_filter",
					params: [
						{ fromBlock: hex(from), toBlock: hex(to), fromAddress: addrs },
					],
				},
			],
		);
		const traces = (await rpc.batch<EthTrace[]>(traceCalls)).flat();
		const ourTopics = addrs.map(addressTopic);
		const logs = (
			await Promise.all(
				chunks(range.from, range.to, LOG_CHUNK).flatMap(([from, to]) => [
					rpc.logs({
						fromBlock: from,
						toBlock: to,
						address: [...tokens.keys()],
						topics: [TRANSFER_TOPIC, null, ourTopics],
					}),
					rpc.logs({
						fromBlock: from,
						toBlock: to,
						address: [...tokens.keys()],
						topics: [TRANSFER_TOPIC, ourTopics],
					}),
				]),
			)
		).flat();

		// Kandidaten: Wertflüsse zu/von uns, Token-Logs, eigene Sendungen
		const flowTraces = traces.filter((t) => {
			const f = traceValueFlow(t);
			return !!f && (ours.has(f.to) || ours.has(f.from));
		});
		const own = ownSentTxids(traces, ours);
		const candidates = [
			...new Set([
				...flowTraces.map((t) => (t.transactionHash ?? "").toLowerCase()),
				...logs.map((l) => l.transactionHash.toLowerCase()),
				...own,
			]),
		].filter(Boolean);
		const receipts = await rpc.batch<EthReceipt | null>(
			candidates.map((h) => ({
				method: "eth_getTransactionReceipt",
				params: [h],
			})),
		);
		const byTx = new Map(candidates.map((h, i) => [h, receipts[i]] as const));
		const revertedTxs = new Set(
			candidates.filter((h) => byTx.get(h)?.status === "0x0"),
		);
		// Rahmen mit Fehler nur für interne Aufrufe nachlesen
		const internal = [
			...new Set(
				flowTraces
					.filter((t) => t.traceAddress.length > 0)
					.map((t) => (t.transactionHash ?? "").toLowerCase()),
			),
		];
		const full = await rpc.batch<EthTrace[]>(
			internal.map((h) => ({ method: "trace_transaction", params: [h] })),
		);
		const erroredFrames = new Map(
			internal.map(
				(h, i) =>
					[
						h,
						(full[i] ?? []).filter((t) => !!t.error).map((t) => t.traceAddress),
					] as const,
			),
		);
		const fees = new Map(
			own.flatMap((h) => {
				const r = byTx.get(h);
				if (!r) return [];
				return [
					[
						h,
						{
							fee: hexToBigInt(r.gasUsed) * hexToBigInt(r.effectiveGasPrice),
							from: r.from,
							blockHeight: hexToNumber(r.blockNumber),
							blockHash: r.blockHash,
						},
					] as const,
				];
			}),
		);
		// Blockzeiten
		const heights = [
			...new Set([
				...flowTraces.map((t) => t.blockNumber),
				...logs.map((l) => hexToNumber(l.blockNumber)),
				...[...fees.values()].map((f) => f.blockHeight),
			]),
		];
		const blocks = await rpc.batch<{ hash: string; timestamp: string } | null>(
			heights.map((n) => ({
				method: "eth_getBlockByNumber",
				params: [hex(n), false],
			})),
		);
		const blockTimes = new Map(
			blocks
				.filter((b): b is { hash: string; timestamp: string } => !!b)
				.map(
					(b) =>
						[
							b.hash.toLowerCase(),
							new Date(hexToNumber(b.timestamp) * 1000),
						] as const,
				),
		);
		observations = ethObservations({
			ours,
			traces,
			logs,
			tokens,
			revertedTxs,
			erroredFrames,
			fees,
			blockTimes,
			finalizedHeight,
			latestHeight,
		});
		patch.syncHeight = range.nextSyncHeight;
	}

	// Sanktionsprüfung neuer Eingänge: Absender des Transfers + der Transaktion
	const screening = new Map<string, ScreeningOutcome>();
	const origins = new Map<string, string | null>();
	for (const o of observations) {
		if (o.direction !== "in" || p.knownKeys.has(transferKey(o))) continue;
		if (!origins.has(o.txid))
			origins.set(o.txid, (await rpc.transaction(o.txid))?.from ?? null);
		screening.set(
			transferKey(o),
			screenSources(
				"ethereum",
				[o.counterparty, origins.get(o.txid)],
				sanctions,
			),
		);
	}

	// Stand: final bestätigt (finalized) und darüber hinaus (latest)
	const balances: AccountBalances = {};
	for (const asset of ASSETS[account.network]) {
		let fin = 0n;
		let all = 0n;
		for (const a of addrs) {
			if (asset.kind === "native") {
				fin += await rpc.balance(a, "finalized");
				all += await rpc.balance(a, "latest");
			} else {
				fin += await rpc.tokenBalance(asset.contract as string, a, "finalized");
				all += await rpc.tokenBalance(asset.contract as string, a, "latest");
			}
		}
		balances[asset.code] = {
			confirmed: fin.toString(),
			pending: (all - fin).toString(),
		};
	}
	patch.balances = balances;
	patch.balanceHeight = finalizedHeight;
	patch.balanceHash = finalized.hash.toLowerCase();
	return {
		observations,
		goneTxids: new Set(),
		rescanned: range ? { from: range.from, to: range.to } : undefined,
		screening,
		newAddresses,
		accountPatch: patch,
	};
}

const hex = (n: number) => `0x${n.toString(16)}`;

// ── Schreiben ────────────────────────────────────────────────────────────

async function apply(
	tx: OrgTx,
	orgId: string,
	p: Prepared,
	r: NodeResult,
	now: Date,
): Promise<void> {
	const { account } = p;
	if (r.newAddresses.length > 0)
		await tx
			.insert(walletAddresses)
			.values(
				r.newAddresses.map((a) => ({
					organizationId: orgId,
					accountId: account.id,
					branch: a.branch,
					index: a.index,
					address: a.address,
				})),
			)
			.onConflictDoNothing();
	const addressRows = await tx
		.select({ id: walletAddresses.id, address: walletAddresses.address })
		.from(walletAddresses)
		.where(eq(walletAddresses.accountId, account.id));
	const addressId = new Map(
		addressRows.map((a) => [a.address.toLowerCase(), a.id] as const),
	);

	// beobachtete und verschwundene Transaktionen (Reorg/Konflikt)
	const txids = [
		...new Set([...r.observations.map((o) => o.txid), ...r.goneTxids]),
	];
	const existing: ExistingTransfer[] = [];
	for (let i = 0; i < Math.max(txids.length, 1); i += 500) {
		const slice = txids.slice(i, i + 500);
		existing.push(
			...(await tx
				.select({
					id: walletTransfers.id,
					txid: walletTransfers.txid,
					outputRef: walletTransfers.outputRef,
					asset: walletTransfers.asset,
					status: walletTransfers.status,
					confirmations: walletTransfers.confirmations,
					blockHeight: walletTransfers.blockHeight,
					blockHash: walletTransfers.blockHash,
				})
				.from(walletTransfers)
				.where(
					and(
						eq(walletTransfers.accountId, account.id),
						slice.length > 0
							? or(
									eq(walletTransfers.status, "pending"),
									inArray(walletTransfers.txid, slice),
								)
							: eq(walletTransfers.status, "pending"),
					),
				)),
		);
	}
	const unique = new Map(existing.map((e) => [e.id, e] as const));
	const plan = planTransfers([...unique.values()], r.observations, {
		goneTxids: r.goneTxids,
		rescanned: r.rescanned,
	});

	// Ausgänge gehören zu Auszahlungen (alle Fassungen: Erhöhung, Abbruch)
	const payoutByTxid = new Map<string, string>();
	for (const p of await tx
		.select({ id: walletPayouts.id, txids: walletPayouts.txids })
		.from(walletPayouts)
		.where(eq(walletPayouts.accountId, account.id)))
		for (const t of p.txids) payoutByTxid.set(t.toLowerCase(), p.id);
	const unknownSpends = new Set<string>();

	let recipientsCache: string[] | null = null;
	const recipients = async () =>
		(recipientsCache ??= await membersAllowed(tx, orgId, { wallet: ["read"] }));
	const label = (asset: AssetCode, amount: bigint) => {
		const info = assetOf(account.network, asset);
		return `${formatAmountDe(amount, info?.decimals ?? 0)} ${asset}`;
	};

	for (const o of plan.inserts) {
		const outcome = r.screening.get(transferKey(o));
		const hit = outcome?.result === "hit";
		const [row] = await tx
			.insert(walletTransfers)
			.values({
				organizationId: orgId,
				accountId: account.id,
				addressId: o.address ? (addressId.get(o.address) ?? null) : null,
				direction: o.direction,
				asset: o.asset,
				amount: o.amount.toString(),
				txid: o.txid,
				outputRef: o.outputRef,
				address: o.address,
				counterparty: o.counterparty,
				blockHeight: o.blockHeight,
				blockHash: o.blockHash,
				blockTime: o.blockTime,
				confirmations: o.confirmations,
				status: o.status,
				screening:
					o.direction === "in" ? (outcome?.result ?? "unchecked") : "clear",
				screeningRef: outcome?.ref ?? null,
				frozen: hit,
				payoutId: payoutByTxid.get(o.txid.toLowerCase()) ?? null,
				confirmedAt: o.status === "confirmed" ? now : null,
			})
			.onConflictDoNothing()
			.returning({ id: walletTransfers.id });
		if (!row) continue;
		// Ausgang eines Hot-Kontos ohne Auszahlung: Schlüssel woanders benutzt
		if (
			o.direction === "out" &&
			account.kind === "hot" &&
			!payoutByTxid.has(o.txid.toLowerCase()) &&
			!unknownSpends.has(o.txid)
		) {
			unknownSpends.add(o.txid);
			await unknownSpend(tx, orgId, account, o.txid);
		}
		const seenId =
			o.direction === "in" && o.address ? addressId.get(o.address) : undefined;
		if (seenId)
			await tx
				.update(walletAddresses)
				.set({ firstSeenAt: now })
				.where(
					and(
						eq(walletAddresses.id, seenId),
						// nur beim ersten Eingang
						isNull(walletAddresses.firstSeenAt),
					),
				);
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: hit ? "wallet.transfer_frozen" : "wallet.transfer_seen",
				target: `wallet_transfer:${row.id}`,
				after: {
					accountId: account.id,
					direction: o.direction,
					asset: o.asset,
					amount: o.amount.toString(),
					txid: o.txid,
					status: o.status,
					...(hit ? { screeningRef: outcome?.ref } : {}),
				},
			},
		);
		if (hit)
			await notify(tx, {
				orgId,
				recipients: await recipients(),
				actorUserId: null,
				kind: "security_alert",
				title: `Eingang eingefroren: ${label(o.asset, o.amount)} von einer gesperrten Adresse`,
				body: `Konto „${account.name}“. Der Betrag zählt nicht als verfügbar, bis die Prüfung abgeschlossen ist.`,
				link: "/wallet/bewegungen",
				payload: { transferId: row.id, txid: o.txid },
			});
		else if (o.outputRef !== "out:fee") {
			const confirmedIn = o.direction === "in" && o.status === "confirmed";
			if (confirmedIn || o.direction === "out")
				await notify(tx, {
					orgId,
					recipients: await recipients(),
					actorUserId: null,
					kind: "wallet_transfer",
					title:
						o.direction === "in"
							? `Eingang bestätigt: ${label(o.asset, o.amount)}`
							: `Ausgang gesehen: ${label(o.asset, o.amount)}`,
					body: `Konto „${account.name}“`,
					link: "/wallet/bewegungen",
					payload: { transferId: row.id, txid: o.txid },
				});
		}
	}

	for (const u of plan.updates) {
		await tx
			.update(walletTransfers)
			.set({
				status: u.status,
				confirmations: u.confirmations,
				blockHeight: u.blockHeight,
				blockHash: u.blockHash,
				blockTime: u.blockTime,
				...(u.becameConfirmed ? { confirmedAt: now } : {}),
			})
			.where(eq(walletTransfers.id, u.id));
		if (!u.becameConfirmed && !u.revived) continue;
		const [t] = await tx
			.select()
			.from(walletTransfers)
			.where(eq(walletTransfers.id, u.id));
		if (!t) continue;
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: u.becameConfirmed
					? "wallet.transfer_confirmed"
					: "wallet.transfer_seen",
				target: `wallet_transfer:${t.id}`,
				after: {
					txid: t.txid,
					confirmations: u.confirmations,
					blockHeight: u.blockHeight,
				},
			},
		);
		if (u.becameConfirmed && t.direction === "in" && !t.frozen)
			await notify(tx, {
				orgId,
				recipients: await recipients(),
				actorUserId: null,
				kind: "wallet_transfer",
				title: `Eingang bestätigt: ${label(t.asset, BigInt(t.amount))}`,
				body: `Konto „${account.name}“`,
				link: "/wallet/bewegungen",
				payload: { transferId: t.id, txid: t.txid },
			});
	}

	for (const d of plan.drops) {
		await tx
			.update(walletTransfers)
			.set({ status: "dropped" })
			.where(eq(walletTransfers.id, d.id));
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: "wallet.transfer_dropped",
				target: `wallet_transfer:${d.id}`,
				after: { txid: d.txid },
			},
		);
	}

	await tx
		.update(walletAccounts)
		.set({
			...r.accountPatch,
			syncedAt: now,
			syncError: null,
			balanceAt: now,
		})
		.where(eq(walletAccounts.id, account.id));
}

async function alert(
	tx: OrgTx,
	orgId: string,
	account: WalletAccount,
	message: string,
) {
	await audit(
		tx,
		{ userId: null },
		{
			organizationId: orgId,
			action: "wallet.node_mismatch",
			target: `wallet_account:${account.id}`,
			after: { message },
		},
	);
	await notify(tx, {
		orgId,
		recipients: await membersAllowed(tx, orgId, { wallet: ["read"] }),
		actorUserId: null,
		kind: "security_alert",
		title: `Wallet-Konto „${account.name}“ angehalten`,
		body: message,
		link: "/wallet/konten",
	});
}

// Unbekannte Ausgabe aus einem Hot-Konto: Alarm an alle im Wallet-Bereich
// und den Signer sofort einfrieren (bremsen darf die App ohne Schlüssel)
async function unknownSpend(
	tx: OrgTx,
	orgId: string,
	account: WalletAccount,
	txid: string,
) {
	let frozen = false;
	if (signerConfigured())
		try {
			await signerCall("freeze", {
				reason: `Unbekannte Ausgabe ${txid.slice(0, 16)}`,
			});
			frozen = true;
		} catch (e) {
			logger.error({ orgId, txid, err: e }, "signer freeze failed");
		}
	await audit(
		tx,
		{ userId: null },
		{
			organizationId: orgId,
			action: "wallet.unknown_spend",
			target: `wallet_account:${account.id}`,
			after: { txid, signerFrozen: frozen },
		},
	);
	await notify(tx, {
		orgId,
		recipients: await membersAllowed(tx, orgId, { wallet: ["read"] }),
		actorUserId: null,
		kind: "security_alert",
		title: `Unbekannte Ausgabe aus Hot-Konto „${account.name}“`,
		body: frozen
			? `Transaktion ${txid} gehört zu keiner Auszahlung in Klick. Der Signer wurde eingefroren.`
			: `Transaktion ${txid} gehört zu keiner Auszahlung in Klick. Den Signer sofort einfrieren (Sicherheit).`,
		link: "/wallet/sicherheit",
		payload: { txid },
	});
}
