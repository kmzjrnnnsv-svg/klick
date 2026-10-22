/**
 * Lokale Testkette für Entwicklung und QA — kein Ersatz für die Abnahme mit
 * echten Knoten (Plan Wallet, „Ziel: eine funktionierende Wallet“).
 *
 * Bildet die JSON-RPC-Teilmenge nach, die Klick nutzt:
 *   Bitcoin Core (Signet)  Port 18443: Beobachtungs-Wallets mit Descriptoren,
 *     listsinceblock (inkl. removed), gettransaction, getrawtransaction,
 *     getbalance(s), deriveaddresses
 *   Reth (Sepolia)         Port 18545: Blöcke mit latest/finalized,
 *     trace_filter/trace_transaction, eth_getLogs (Transfer), Quittungen,
 *     Salden, balanceOf — auch Batch-Anfragen
 * Steuerung (POST, JSON):
 *   :18443/dev/faucet {address, amount:"0.01"}       BTC in den Mempool
 *   :18443/dev/mine {n}                              Blöcke erzeugen
 *   :18443/dev/reorg {depth, conflict?}              letzte Blöcke verwerfen
 *   :18545/dev/faucet {address, asset, amount, viaContract?}  amount in Basiseinheiten
 *   :18545/dev/mine {n}
 * Chainlink-Feeds (Sepolia-Adressen aus lib/wallet/core/feeds.ts) liefern
 * synthetische Kurse mit Runden alle 3 h — rückwärts abfragbar.
 * Zustand liegt in QA_DIR/devchain.json (überlebt Neustarts).
 *
 *   pnpm wallet:devchain [--auto]
 *   WALLET_RPC_BITCOIN_SIGNET=http://dev:dev@127.0.0.1:18443
 *   WALLET_RPC_ETHEREUM_SEPOLIA=http://127.0.0.1:18545
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { join } from "node:path";
import { assetOf } from "../lib/wallet/core/assets";
import { deriveAddress, parseAccountKey } from "../lib/wallet/core/derive";
import { FEEDS, type FeedKey } from "../lib/wallet/core/feeds";
import { QA_DIR } from "./qa/paths";

const BTC_PORT = Number(process.env.DEVCHAIN_BTC_PORT ?? 18443);
const ETH_PORT = Number(process.env.DEVCHAIN_ETH_PORT ?? 18545);
const STATE_FILE = join(QA_DIR, "devchain.json");
const FINALITY_LAG = 2; // Sepolia-Nachbau: finalized = Spitze − 2

const rnd = (n = 32) => randomBytes(n).toString("hex");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const nowSec = () => Math.floor(Date.now() / 1000);

type BtcTx = {
	txid: string;
	outputs: { address: string; sats: string }[];
	from: string;
	block: string | null;
	time: number;
	// durch Reorg/Doppelausgabe ungültig (Bitcoin Core: Bestätigungen < 0)
	conflicted?: boolean;
};
type BtcBlock = { hash: string; height: number; time: number; txids: string[] };
type EthTransfer = {
	hash: string;
	kind: "eth" | "internal" | "token";
	asset: "ETH" | "USDC" | "EURC";
	from: string;
	to: string;
	value: string;
	block: number;
	logIndex: number;
};
type EthBlock = { number: number; hash: string; parent: string; time: number };
type State = {
	btc: {
		blocks: BtcBlock[];
		mempool: string[];
		txs: Record<string, BtcTx>;
		orphaned: Record<string, string[]>; // verworfener Block → Transaktionen
		wallets: Record<
			string,
			{ keys: { tpub: string; branch: number; range: number }[] }
		>;
	};
	eth: { blocks: EthBlock[]; transfers: EthTransfer[] };
};

function initial(): State {
	const genesis = { hash: rnd(), height: 0, time: nowSec(), txids: [] };
	return {
		btc: { blocks: [genesis], mempool: [], txs: {}, orphaned: {}, wallets: {} },
		eth: {
			blocks: [
				{
					number: 0,
					hash: `0x${rnd()}`,
					parent: `0x${"0".repeat(64)}`,
					time: nowSec(),
				},
			],
			transfers: [],
		},
	};
}

const state: State = existsSync(STATE_FILE)
	? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as State)
	: initial();
const save = () => {
	mkdirSync(QA_DIR, { recursive: true, mode: 0o700 });
	writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 });
};

class RpcFault extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

// ── Bitcoin ──────────────────────────────────────────────────────────────

// BTC-Beträge als JSON-Zahl mit 8 Stellen (wie Bitcoin Core)
const AMOUNT = "\u0000amt:";
const btcAmount = (sats: bigint) => {
	const neg = sats < 0n;
	const a = neg ? -sats : sats;
	return `${AMOUNT}${neg ? "-" : ""}${a / 100_000_000n}.${(a % 100_000_000n).toString().padStart(8, "0")}`;
};
const serialize = (v: unknown) =>
	JSON.stringify(v).replace(/"\\u0000amt:(-?[0-9.]+)"/g, "$1");

const tip = () => state.btc.blocks[state.btc.blocks.length - 1] as BtcBlock;
const blockOf = (hash: string) => state.btc.blocks.find((b) => b.hash === hash);

function walletAddresses(name: string): Map<string, true> {
	const w = state.btc.wallets[name];
	const out = new Map<string, true>();
	for (const k of w?.keys ?? []) {
		const { hd } = parseAccountKey(k.tpub, "bitcoin_signet");
		for (let i = 0; i < k.range; i += 1)
			out.set(deriveAddress(hd, "bitcoin_signet", k.branch as 0 | 1, i), true);
	}
	return out;
}

const confs = (tx: BtcTx) => {
	if (tx.conflicted) return -1;
	if (!tx.block) return 0;
	const b = blockOf(tx.block);
	return b ? tip().height - b.height + 1 : -1;
};

function entries(tx: BtcTx, mine: Map<string, true>) {
	const b = tx.block ? blockOf(tx.block) : undefined;
	return tx.outputs.flatMap((o, vout) =>
		mine.has(o.address)
			? [
					{
						address: o.address,
						category: "receive",
						amount: btcAmount(BigInt(o.sats)),
						vout,
						confirmations: confs(tx),
						...(b
							? { blockhash: b.hash, blockheight: b.height, blocktime: b.time }
							: {}),
						txid: tx.txid,
						time: tx.time,
					},
				]
			: [],
	);
}

function parseDesc(desc: string): { tpub: string; branch: number } {
	const m = /^wpkh\(([1-9A-HJ-NP-Za-km-z]+)\/([01])\/\*\)/.exec(
		desc.split("#")[0] as string,
	);
	if (!m) throw new RpcFault(-5, "nur wpkh(tpub/<0|1>/*)");
	return { tpub: m[1] as string, branch: Number(m[2]) };
}

// Methoden, die Klick braucht (= rpcwhitelist in deploy/nodes)
const BTC_METHODS = new Set([
	"getblockchaininfo",
	"listwallets",
	"loadwallet",
	"createwallet",
	"getdescriptorinfo",
	"importdescriptors",
	"deriveaddresses",
	"listsinceblock",
	"gettransaction",
	"getrawtransaction",
	"getbalance",
	"getbalances",
]);

function btcCall(
	method: string,
	params: unknown[],
	wallet: string | null,
): unknown {
	const b = state.btc;
	switch (method) {
		case "getblockchaininfo":
			return {
				chain: "signet",
				blocks: tip().height,
				headers: tip().height,
				bestblockhash: tip().hash,
				initialblockdownload: false,
			};
		case "listwallets":
			return Object.keys(b.wallets);
		case "loadwallet":
			if (!b.wallets[params[0] as string])
				throw new RpcFault(-18, "Wallet file not found");
			return { name: params[0] };
		case "createwallet":
			b.wallets[params[0] as string] = { keys: [] };
			return { name: params[0] };
		case "getdescriptorinfo":
			return { checksum: sha(params[0] as string).slice(0, 8) };
		case "importdescriptors": {
			const w = b.wallets[wallet ?? ""];
			if (!w)
				throw new RpcFault(
					-18,
					"Requested wallet does not exist or is not loaded",
				);
			return (params[0] as { desc: string; range: [number, number] }[]).map(
				(r) => {
					const { tpub, branch } = parseDesc(r.desc);
					const existing = w.keys.find(
						(k) => k.tpub === tpub && k.branch === branch,
					);
					if (existing)
						existing.range = Math.max(existing.range, r.range[1] + 1);
					else w.keys.push({ tpub, branch, range: r.range[1] + 1 });
					return { success: true };
				},
			);
		}
		case "deriveaddresses": {
			const { tpub, branch } = parseDesc(params[0] as string);
			const [from, to] = params[1] as [number, number];
			const { hd } = parseAccountKey(tpub, "bitcoin_signet");
			const out: string[] = [];
			for (let i = from; i <= to; i += 1)
				out.push(deriveAddress(hd, "bitcoin_signet", branch as 0 | 1, i));
			return out;
		}
		case "listsinceblock": {
			const mine = walletAddresses(wallet ?? "");
			const hash = (params[0] as string) || null;
			const target = Number(params[1] ?? 1);
			let fromHeight = -1;
			let removed: ReturnType<typeof entries> = [];
			if (hash) {
				const known = blockOf(hash);
				if (known) fromHeight = known.height;
				else {
					// verworfener Block: alles ab dem gemeinsamen Vorfahren neu
					removed = (b.orphaned[hash] ?? []).flatMap((txid) => {
						const tx = b.txs[txid];
						return tx ? entries({ ...tx, block: null }, mine) : [];
					});
					fromHeight = Math.max(-1, tip().height - 10);
				}
			}
			// wie Bitcoin Core: auch Konflikte (Tiefe −1) werden gemeldet
			const txids = [
				...b.blocks
					.filter((x) => x.height > fromHeight)
					.flatMap((x) => x.txids),
				...b.mempool,
				...Object.values(b.txs)
					.filter((t) => t.conflicted)
					.map((t) => t.txid),
			];
			const lastHeight = Math.max(0, tip().height - target + 1);
			return {
				transactions: txids.flatMap((id) => {
					const tx = b.txs[id];
					return tx ? entries(tx, mine) : [];
				}),
				removed,
				lastblock: (b.blocks[lastHeight] as BtcBlock).hash,
			};
		}
		case "gettransaction": {
			const tx = b.txs[params[0] as string];
			if (!tx) throw new RpcFault(-5, "Invalid or non-wallet transaction id");
			return { txid: tx.txid, confirmations: confs(tx) };
		}
		case "getrawtransaction": {
			const tx = b.txs[params[0] as string];
			if (!tx)
				throw new RpcFault(-5, "No such mempool or blockchain transaction");
			return {
				txid: tx.txid,
				vin: [{ prevout: { scriptPubKey: { address: tx.from } } }],
			};
		}
		case "getbalance": {
			const mine = walletAddresses(wallet ?? "");
			const minconf = Number(params[1] ?? 1);
			let sum = 0n;
			for (const tx of Object.values(b.txs))
				if (confs(tx) >= minconf && (tx.block || b.mempool.includes(tx.txid)))
					for (const o of tx.outputs)
						if (mine.has(o.address)) sum += BigInt(o.sats);
			return btcAmount(sum);
		}
		case "getbalances": {
			const mine = walletAddresses(wallet ?? "");
			let trusted = 0n;
			let pending = 0n;
			for (const tx of Object.values(b.txs)) {
				const c = confs(tx);
				const inMempool = b.mempool.includes(tx.txid);
				if (c < 0 || (!tx.block && !inMempool)) continue;
				for (const o of tx.outputs)
					if (mine.has(o.address)) {
						if (c >= 1) trusted += BigInt(o.sats);
						else pending += BigInt(o.sats);
					}
			}
			return {
				mine: {
					trusted: btcAmount(trusted),
					untrusted_pending: btcAmount(pending),
					immature: btcAmount(0n),
				},
			};
		}
		default:
			// wie rpcwhitelist in Bitcoin Core: HTTP 403 ohne Inhalt
			throw new Forbidden();
	}
}

class Forbidden extends Error {}

function mineBtc(n: number) {
	for (let i = 0; i < n; i += 1) {
		const block = {
			hash: rnd(),
			height: tip().height + 1,
			time: nowSec(),
			txids: [...state.btc.mempool],
		};
		for (const id of block.txids) {
			const tx = state.btc.txs[id];
			if (tx) tx.block = block.hash;
		}
		state.btc.mempool = [];
		state.btc.blocks.push(block);
	}
}

// ── Ethereum ─────────────────────────────────────────────────────────────

const ethTip = () => state.eth.blocks[state.eth.blocks.length - 1] as EthBlock;
const h = (n: number | bigint) => `0x${n.toString(16)}`;
const ethBlockJson = (b: EthBlock) => ({
	number: h(b.number),
	hash: b.hash,
	parentHash: b.parent,
	timestamp: h(b.time),
});
const resolveTag = (tag: string) =>
	tag === "latest" || tag === "pending"
		? ethTip().number
		: tag === "finalized" || tag === "safe"
			? Math.max(0, ethTip().number - FINALITY_LAG)
			: Number(BigInt(tag));
const lc = (s: string) => s.toLowerCase();
const pad = (a: string) => `0x${lc(a).replace(/^0x/, "").padStart(64, "0")}`;
const TOKEN_OF: Record<string, "USDC" | "EURC"> = {};
for (const code of ["USDC", "EURC"] as const) {
	const c = assetOf("ethereum_sepolia", code)?.contract;
	if (c) TOKEN_OF[lc(c)] = code;
}
const CONTRACT = (code: "USDC" | "EURC") =>
	lc(assetOf("ethereum_sepolia", code)?.contract as string);
const ROUTER = `0x${"c0ffee".padStart(40, "0")}`;
const TRANSFER =
	"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function traceOf(t: EthTransfer) {
	const b = state.eth.blocks[t.block] as EthBlock;
	return {
		type: "call",
		action: {
			from: t.from,
			to: t.to,
			value: h(BigInt(t.value)),
			callType: "call",
		},
		blockNumber: t.block,
		blockHash: b.hash,
		transactionHash: t.hash,
		traceAddress: t.kind === "internal" ? [0] : [],
	};
}

function ethBalance(address: string, asset: string, upTo: number): bigint {
	let sum = 0n;
	for (const t of state.eth.transfers) {
		if (t.asset !== asset || t.block > upTo) continue;
		if (lc(t.to) === lc(address)) sum += BigInt(t.value);
		if (lc(t.from) === lc(address)) sum -= BigInt(t.value);
	}
	return sum;
}

// Chainlink-Nachbau: Runden alle 3 h seit Juli 2025, Kurs als ruhige
// Wellen um einen Grundwert (deterministisch, damit Verläufe stabil bleiben)
const FEED_T0 = Date.UTC(2025, 6, 1) / 1000;
const FEED_STEP = 3 * 3600;
const FEED_SHAPE: Record<FeedKey, { base: number; amp: number }> = {
	"BTC/USD": { base: 64_000, amp: 0.18 },
	"ETH/USD": { base: 2_600, amp: 0.22 },
	"USDC/USD": { base: 1, amp: 0.0006 },
	"EUR/USD": { base: 1.085, amp: 0.025 },
};
const FEED_BY_ADDRESS = new Map(
	(FEEDS.ethereum_sepolia ?? []).map((f) => [lc(f.address), f] as const),
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
function feedCall(key: FeedKey, description: string, data: string): string {
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

function ethCall(method: string, params: unknown[]): unknown {
	const e = state.eth;
	switch (method) {
		case "eth_chainId":
			return h(11155111);
		case "eth_getBlockByNumber": {
			const n = resolveTag(params[0] as string);
			const b = e.blocks[n];
			return b ? ethBlockJson(b) : null;
		}
		case "trace_filter": {
			const f = params[0] as {
				fromBlock: string;
				toBlock: string;
				toAddress?: string[];
				fromAddress?: string[];
			};
			const from = resolveTag(f.fromBlock);
			const to = resolveTag(f.toBlock);
			const toSet = f.toAddress?.map(lc);
			const fromSet = f.fromAddress?.map(lc);
			return e.transfers
				.filter(
					(t) =>
						t.kind !== "token" &&
						t.block >= from &&
						t.block <= to &&
						(!toSet || toSet.includes(lc(t.to))) &&
						(!fromSet || fromSet.includes(lc(t.from))),
				)
				.map(traceOf);
		}
		case "trace_transaction": {
			const list = e.transfers.filter((t) => t.hash === params[0]);
			const first = list[0];
			if (!first) return [];
			const b = e.blocks[first.block] as EthBlock;
			const root = {
				type: "call",
				action: {
					from: first.from,
					to: first.kind === "internal" ? ROUTER : first.to,
					value: "0x0",
					callType: "call",
				},
				blockNumber: first.block,
				blockHash: b.hash,
				transactionHash: first.hash,
				traceAddress: [],
			};
			return [root, ...list.filter((t) => t.kind === "internal").map(traceOf)];
		}
		case "eth_getLogs": {
			const f = params[0] as {
				fromBlock: string;
				toBlock: string;
				address: string[];
				topics: (string | string[] | null)[];
			};
			const from = resolveTag(f.fromBlock);
			const to = resolveTag(f.toBlock);
			const match = (pos: number, value: string) => {
				const want = f.topics[pos];
				if (want === null || want === undefined) return true;
				return (Array.isArray(want) ? want : [want])
					.map(lc)
					.includes(lc(value));
			};
			return e.transfers
				.filter(
					(t) =>
						t.kind === "token" &&
						t.block >= from &&
						t.block <= to &&
						f.address.map(lc).includes(CONTRACT(t.asset as "USDC" | "EURC")) &&
						match(0, TRANSFER) &&
						match(1, pad(t.from)) &&
						match(2, pad(t.to)),
				)
				.map((t) => ({
					address: CONTRACT(t.asset as "USDC" | "EURC"),
					topics: [TRANSFER, pad(t.from), pad(t.to)],
					data: pad(h(BigInt(t.value))),
					blockNumber: h(t.block),
					blockHash: (e.blocks[t.block] as EthBlock).hash,
					transactionHash: t.hash,
					logIndex: h(t.logIndex),
				}));
		}
		case "eth_getTransactionReceipt": {
			const t = e.transfers.find((x) => x.hash === params[0]);
			if (!t) return null;
			const b = e.blocks[t.block] as EthBlock;
			return {
				status: "0x1",
				from: t.from,
				gasUsed: h(21000),
				effectiveGasPrice: h(1_000_000_000),
				blockNumber: h(t.block),
				blockHash: b.hash,
			};
		}
		case "eth_getTransactionByHash": {
			const t = e.transfers.find((x) => x.hash === params[0]);
			return t ? { hash: t.hash, from: t.from } : null;
		}
		case "eth_getBalance":
			return h(
				ethBalance(params[0] as string, "ETH", resolveTag(params[1] as string)),
			);
		case "eth_call": {
			const call = params[0] as { to: string; data: string };
			const feed = FEED_BY_ADDRESS.get(lc(call.to));
			if (feed) return feedCall(feed.key, feed.description, call.data);
			const code = TOKEN_OF[lc(call.to)];
			if (!code) throw new RpcFault(-32000, "execution reverted");
			// decimals() und symbol() wie bei Circle (6 Stellen)
			if (call.data === "0x313ce567") return pad(h(6));
			if (call.data === "0x95d89b41") {
				const hex = Buffer.from(code, "utf8").toString("hex");
				return `0x${"20".padStart(64, "0")}${h(code.length).slice(2).padStart(64, "0")}${hex.padEnd(64, "0")}`;
			}
			if (!call.data.startsWith("0x70a08231"))
				throw new RpcFault(-32000, "execution reverted");
			const addr = `0x${call.data.slice(-40)}`;
			return pad(h(ethBalance(addr, code, resolveTag(params[1] as string))));
		}
		default:
			throw new RpcFault(-32601, `the method ${method} does not exist`);
	}
}

function mineEth(n: number) {
	for (let i = 0; i < n; i += 1) {
		const prev = ethTip();
		state.eth.blocks.push({
			number: prev.number + 1,
			hash: `0x${rnd()}`,
			parent: prev.hash,
			time: Math.max(nowSec(), prev.time + 12),
		});
	}
}

// ── HTTP ────────────────────────────────────────────────────────────────

async function body(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const c of req) chunks.push(c as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

type Req = { id: unknown; method: string; params?: unknown[] };

function handleRpc(
	text: string,
	call: (m: string, p: unknown[]) => unknown,
	version: "1.0" | "2.0",
): { status: number; body: string } {
	const parsed = JSON.parse(text) as Req | Req[];
	const one = (r: Req) => {
		try {
			return {
				jsonrpc: version === "2.0" ? "2.0" : undefined,
				id: r.id,
				result: call(r.method, r.params ?? []),
				error: null,
			};
		} catch (e) {
			const f = e instanceof RpcFault ? e : new RpcFault(-1, String(e));
			return {
				jsonrpc: version === "2.0" ? "2.0" : undefined,
				id: r.id,
				result: null,
				error: { code: f.code, message: f.message },
			};
		}
	};
	if (Array.isArray(parsed))
		return { status: 200, body: serialize(parsed.map(one)) };
	const res = one(parsed);
	// Bitcoin Core: RPC-Fehler mit HTTP 500
	return {
		status: res.error && version === "1.0" ? 500 : 200,
		body: serialize(res),
	};
}

function send(res: ServerResponse, status: number, text: string) {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(text);
}

const btcServer = createServer(async (req, res) => {
	const text = await body(req);
	const url = req.url ?? "/";
	if (url.startsWith("/dev/")) {
		const input = text ? (JSON.parse(text) as Record<string, unknown>) : {};
		if (url === "/dev/faucet") {
			const [whole, frac = ""] = String(input.amount ?? "0.01").split(".");
			const sats =
				BigInt(whole as string) * 100_000_000n +
				BigInt(frac.padEnd(8, "0").slice(0, 8) || "0");
			const tx: BtcTx = {
				txid: rnd(),
				outputs: [
					{
						address: String(input.address).toLowerCase(),
						sats: sats.toString(),
					},
				],
				from: String(
					input.from ?? "tb1qfaucetfaucetfaucetfaucetfaucetfau0x5tqm",
				),
				block: null,
				time: nowSec(),
			};
			state.btc.txs[tx.txid] = tx;
			state.btc.mempool.push(tx.txid);
			save();
			return send(res, 200, JSON.stringify({ txid: tx.txid }));
		}
		if (url === "/dev/mine") {
			mineBtc(Number(input.n ?? 1));
			save();
			return send(res, 200, JSON.stringify({ height: tip().height }));
		}
		if (url === "/dev/reorg") {
			const depth = Number(input.depth ?? 1);
			const dropped = state.btc.blocks.splice(-depth, depth);
			// {conflict:false}: Transaktionen zurück in den Mempool; sonst
			// Doppelausgabe — Bitcoin Core meldet sie mit Bestätigungen < 0
			const conflict = input.conflict !== false;
			for (const b of dropped) {
				state.btc.orphaned[b.hash] = b.txids;
				for (const id of b.txids) {
					const tx = state.btc.txs[id];
					if (!tx) continue;
					tx.block = null;
					if (conflict) tx.conflicted = true;
					else state.btc.mempool.push(id);
				}
			}
			mineBtc(depth + 1);
			save();
			return send(
				res,
				200,
				JSON.stringify({ height: tip().height, dropped: dropped.length }),
			);
		}
		return send(res, 404, "{}");
	}
	const wallet = /^\/wallet\/([^/]+)/.exec(url)?.[1];
	// rpcwhitelist-Nachbau: nicht erlaubte Methode → 403 ohne Inhalt
	try {
		const probe = JSON.parse(text) as { method?: string };
		if (
			!Array.isArray(probe) &&
			probe.method &&
			!BTC_METHODS.has(probe.method)
		) {
			res.writeHead(403);
			res.end();
			return;
		}
	} catch {
		// ungültiges JSON beantwortet handleRpc
	}
	const out = handleRpc(
		text,
		(m, p) => btcCall(m, p, wallet ? decodeURIComponent(wallet) : null),
		"1.0",
	);
	save();
	send(res, out.status, out.body);
});

const ethServer = createServer(async (req, res) => {
	const text = await body(req);
	const url = req.url ?? "/";
	if (url.startsWith("/dev/")) {
		const input = text ? (JSON.parse(text) as Record<string, unknown>) : {};
		if (url === "/dev/faucet") {
			mineEth(1);
			const asset = String(input.asset ?? "ETH") as EthTransfer["asset"];
			const kind: EthTransfer["kind"] =
				asset !== "ETH" ? "token" : input.viaContract ? "internal" : "eth";
			const t: EthTransfer = {
				hash: `0x${rnd()}`,
				kind,
				asset,
				from: String(input.from ?? `0x${"fa0cet".padStart(40, "0")}`),
				to: lc(String(input.address)),
				value: String(
					input.amount ?? (asset === "ETH" ? "100000000000000000" : "5000000"),
				),
				block: ethTip().number,
				logIndex: 0,
			};
			if (kind === "internal") t.from = ROUTER;
			state.eth.transfers.push(t);
			save();
			return send(res, 200, JSON.stringify({ hash: t.hash, block: t.block }));
		}
		if (url === "/dev/mine") {
			mineEth(Number(input.n ?? 1));
			save();
			return send(res, 200, JSON.stringify({ height: ethTip().number }));
		}
		return send(res, 404, "{}");
	}
	const out = handleRpc(text, ethCall, "2.0");
	send(res, out.status, out.body);
});

btcServer.listen(BTC_PORT, "127.0.0.1", () =>
	console.log(`Bitcoin (Signet-Nachbau) auf http://127.0.0.1:${BTC_PORT}`),
);
ethServer.listen(ETH_PORT, "127.0.0.1", () =>
	console.log(`Ethereum (Sepolia-Nachbau) auf http://127.0.0.1:${ETH_PORT}`),
);

// --auto: Blöcke wie im Netz (Bitcoin alle 60 s, Ethereum alle 12 s)
if (process.argv.includes("--auto")) {
	setInterval(() => {
		mineBtc(1);
		save();
	}, 60_000);
	setInterval(() => {
		mineEth(1);
		save();
	}, 12_000);
}
