import { randomBytes } from "node:crypto";
import { deriveAddress, parseAccountKey } from "../../lib/wallet/core/derive";
import {
	checkSpend,
	decodeOutputs,
	dustLimit,
	fundingRaw,
	outputOf,
} from "./btc-tx";
import {
	type BtcBlock,
	type BtcTx,
	Forbidden,
	nowSec,
	RpcFault,
	rnd,
	type State,
	sha,
} from "./state";

// Bitcoin-Core-Nachbau (Signet) der lokalen Testkette: Beobachtungs-Wallets
// mit Descriptoren, echte Roh-Transaktionen und UTXO-Menge, Senden mit
// Prüfung wie ein Knoten (Signaturen, Doppelausgabe, Mindestgebühr, Dust,
// RBF), listsinceblock mit Ausgängen und Gebühr (Wechselgeld wie bei
// Bitcoin Core weggelassen), Salden aus den unverbrauchten Ausgängen.

// Methoden, die Klick braucht (= rpcwhitelist in deploy/nodes/setup-bitcoind.sh)
export const BTC_METHODS = new Set([
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
	"listunspent",
	"estimatesmartfee",
	"testmempoolaccept",
	"sendrawtransaction",
]);

// BTC-Beträge als JSON-Zahl mit 8 Stellen (wie Bitcoin Core): Platzhalter,
// den serializeBtc in eine Zahl ohne Anführungszeichen verwandelt
const AMOUNT = "\u0000amt:";
export const btcAmount = (sats: bigint) => {
	const neg = sats < 0n;
	const a = neg ? -sats : sats;
	return `${AMOUNT}${neg ? "-" : ""}${a / 100_000_000n}.${(a % 100_000_000n).toString().padStart(8, "0")}`;
};
export const serializeBtc = (v: unknown) =>
	JSON.stringify(v).replace(/"\\u0000amt:(-?[0-9.]+)"/g, "$1");

const MIN_RELAY_SAT_VB = 1;
const INCREMENTAL_SAT_VB = 1;
// Standard von sendrawtransaction/testmempoolaccept: 0,10 BTC/kvB
const DEFAULT_MAX_FEE_RATE = 0.1;

export function parseBtcAmount(value: string): bigint {
	const [whole, frac = ""] = value.split(".");
	if (!/^\d+$/.test(whole ?? "") || !/^\d{0,8}$/.test(frac))
		throw new Error(`ungültiger Betrag: ${value}`);
	return BigInt(whole as string) * 100_000_000n + BigInt(frac.padEnd(8, "0"));
}

type Verdict =
	| {
			ok: true;
			known: boolean;
			txid: string;
			wtxid: string;
			fee: bigint;
			vsize: number;
			inputs: { txid: string; vout: number }[];
			outputs: { address: string; sats: bigint }[];
			replaces: string[];
	  }
	| { ok: false; code: number; reason: string; txid?: string };

export function btcChain(state: State) {
	const b = state.btc;
	const tip = () => b.blocks[b.blocks.length - 1] as BtcBlock;
	const blockOf = (hash: string) => b.blocks.find((x) => x.hash === hash);
	const inMempool = (txid: string) => b.mempool.includes(txid);
	// gültig = in einem Block der aktuellen Kette oder im Mempool
	const live = (tx: BtcTx) =>
		!tx.conflicted &&
		!tx.replacedBy &&
		((tx.block !== null && blockOf(tx.block) !== undefined) ||
			inMempool(tx.txid));

	const confs = (tx: BtcTx): number => {
		if (tx.conflicted) return -1;
		if (tx.replacedBy) {
			const r = b.txs[tx.replacedBy];
			const c = r ? confs(r) : 0;
			return c > 0 ? -c : 0;
		}
		if (!tx.block) return 0;
		const blk = blockOf(tx.block);
		return blk ? tip().height - blk.height + 1 : -1;
	};

	const addressCache = new Map<string, Map<string, true>>();
	function walletAddresses(name: string): Map<string, true> {
		const w = b.wallets[name];
		const key = JSON.stringify(w?.keys ?? []);
		const hit = addressCache.get(key);
		if (hit) return hit;
		const out = new Map<string, true>();
		for (const k of w?.keys ?? []) {
			const { hd } = parseAccountKey(k.tpub, "bitcoin_signet");
			for (let i = 0; i < k.range; i += 1)
				out.set(
					deriveAddress(hd, "bitcoin_signet", k.branch as 0 | 1, i),
					true,
				);
		}
		addressCache.set(key, out);
		return out;
	}
	const requireWallet = (wallet: string | null) => {
		if (!wallet || !b.wallets[wallet])
			throw new RpcFault(
				-18,
				"Requested wallet does not exist or is not loaded",
			);
		return walletAddresses(wallet);
	};

	const prevAddress = (i: { txid: string; vout: number }) =>
		b.txs[i.txid]?.outputs[i.vout]?.address ?? "";

	// verbrauchte Ausgänge (durch gültige Transaktionen) → ausgebende Transaktion
	function spenders(): Map<string, string> {
		const out = new Map<string, string>();
		for (const tx of Object.values(b.txs))
			if (live(tx))
				for (const i of tx.inputs) out.set(`${i.txid}:${i.vout}`, tx.txid);
		return out;
	}

	// alle Mempool-Nachfahren (geben Ausgänge der genannten aus)
	function withDescendants(roots: Iterable<string>): Set<string> {
		const out = new Set(roots);
		let grew = true;
		while (grew) {
			grew = false;
			for (const id of b.mempool) {
				const tx = b.txs[id];
				if (!tx || out.has(id)) continue;
				if (tx.inputs.some((i) => out.has(i.txid))) {
					out.add(id);
					grew = true;
				}
			}
		}
		return out;
	}

	function validate(raw: string, maxFeeRate: number): Verdict {
		const check = checkSpend(raw, (txid, vout) => {
			const tx = b.txs[txid];
			return tx && live(tx) ? outputOf(tx.hex, vout) : null;
		});
		if (!check.ok)
			return {
				ok: false,
				code:
					check.reason === "TX decode failed"
						? -22
						: check.reason === "bad-txns-inputs-missingorspent"
							? -25
							: -26,
				reason: check.reason,
			};
		const existing = b.txs[check.txid];
		if (existing && live(existing)) {
			if (existing.block)
				return {
					ok: false,
					code: -27,
					reason: "Transaction outputs already in utxo set",
					txid: check.txid,
				};
			return { ...check, ok: true, known: true, replaces: [] };
		}
		const spent = spenders();
		const conflicts = new Set<string>();
		for (const i of check.inputs) {
			const by = spent.get(`${i.txid}:${i.vout}`);
			if (!by) continue;
			if (b.txs[by]?.block)
				return {
					ok: false,
					code: -25,
					reason: "bad-txns-inputs-missingorspent",
				};
			conflicts.add(by);
		}
		const rate = Number(check.fee) / check.vsize;
		if (rate < MIN_RELAY_SAT_VB)
			return { ok: false, code: -26, reason: "min relay fee not met" };
		for (const o of check.outputs)
			if (o.sats < dustLimit(o.type))
				return { ok: false, code: -26, reason: "dust" };
		// maxfeerate 0 = ohne Grenze (wie Bitcoin Core)
		if (maxFeeRate > 0 && rate > maxFeeRate * 100_000)
			return {
				ok: false,
				code: -25,
				reason: "max-fee-exceeded",
			};
		// RBF (Bitcoin Core ≥ 28: volle Ersetzbarkeit)
		const replaced = withDescendants(conflicts);
		let oldFee = 0n;
		for (const id of conflicts) {
			const old = b.txs[id] as BtcTx;
			const oldRate = Number(old.fee) / old.vsize;
			if (rate <= oldRate)
				return {
					ok: false,
					code: -26,
					reason: `insufficient fee, rejecting replacement ${check.txid}; new feerate ${rate.toFixed(2)} sat/vB <= old feerate ${oldRate.toFixed(2)} sat/vB`,
				};
		}
		for (const id of replaced) oldFee += BigInt((b.txs[id] as BtcTx).fee);
		const needed = oldFee + BigInt(INCREMENTAL_SAT_VB * check.vsize);
		if (replaced.size > 0 && check.fee < needed)
			return {
				ok: false,
				code: -26,
				reason: `insufficient fee, rejecting replacement ${check.txid}; not enough additional fees to relay; ${check.fee} < ${needed}`,
			};
		return { ...check, ok: true, known: false, replaces: [...replaced] };
	}

	function accept(raw: string, maxFeeRate: number): string {
		const v = validate(raw, maxFeeRate);
		if (!v.ok)
			throw new RpcFault(
				v.code,
				v.reason === "max-fee-exceeded"
					? "Fee exceeds maximum configured by user (e.g. -maxtxfee, maxfeerate)"
					: v.reason,
			);
		if (v.known) return v.txid;
		for (const id of v.replaces) {
			const old = b.txs[id] as BtcTx;
			old.replacedBy = v.txid;
		}
		b.mempool = b.mempool.filter((id) => !v.replaces.includes(id));
		const first = v.inputs[0];
		b.txs[v.txid] = {
			txid: v.txid,
			hex: raw.toLowerCase(),
			inputs: v.inputs,
			outputs: v.outputs.map((o) => ({
				address: o.address,
				sats: o.sats.toString(),
			})),
			fee: v.fee.toString(),
			vsize: v.vsize,
			from: first ? prevAddress(first) : "",
			block: null,
			time: nowSec(),
		};
		b.mempool.push(v.txid);
		return v.txid;
	}

	// Mempool-Transaktionen, deren Eingänge weggefallen sind, verwerfen
	function evictInvalid() {
		let changed = true;
		while (changed) {
			changed = false;
			for (const id of [...b.mempool]) {
				const tx = b.txs[id];
				if (!tx) continue;
				const ok = tx.inputs.every((i) => {
					const prev = b.txs[i.txid];
					return prev !== undefined && live(prev);
				});
				if (!ok) {
					tx.conflicted = true;
					b.mempool = b.mempool.filter((x) => x !== id);
					changed = true;
				}
			}
		}
	}

	const fromMe = (tx: BtcTx, mine: Map<string, true>) =>
		tx.inputs.length > 0 && tx.inputs.every((i) => mine.has(prevAddress(i)));
	const debits = (tx: BtcTx, mine: Map<string, true>) =>
		tx.inputs.some((i) => mine.has(prevAddress(i)));

	function entries(tx: BtcTx, mine: Map<string, true>) {
		const blk = tx.block ? blockOf(tx.block) : undefined;
		const common = {
			confirmations: confs(tx),
			...(blk
				? { blockhash: blk.hash, blockheight: blk.height, blocktime: blk.time }
				: {}),
			txid: tx.txid,
			time: tx.time,
			"bip125-replaceable": blk ? "no" : "yes",
			...(tx.replacedBy
				? { replaced_by_txid: tx.replacedBy, mempoolconflicts: [tx.replacedBy] }
				: {}),
		};
		if (debits(tx, mine))
			// Ausgang: nur fremde Ziele; eigene Ausgänge gelten als Wechselgeld
			return tx.outputs.flatMap((o, vout) =>
				mine.has(o.address)
					? []
					: [
							{
								address: o.address,
								category: "send",
								amount: btcAmount(-BigInt(o.sats)),
								vout,
								fee: btcAmount(-BigInt(tx.fee)),
								abandoned: false,
								...common,
							},
						],
			);
		return tx.outputs.flatMap((o, vout) =>
			mine.has(o.address)
				? [
						{
							address: o.address,
							category: "receive",
							amount: btcAmount(BigInt(o.sats)),
							vout,
							...common,
						},
					]
				: [],
		);
	}

	// unverbrauchte eigene Ausgänge mit Bestätigungen und „sicher“ (Bitcoin
	// Core: unbestätigt nur sicher, wenn die Transaktion von uns stammt)
	function unspent(mine: Map<string, true>) {
		const spent = spenders();
		const out: {
			tx: BtcTx;
			vout: number;
			address: string;
			sats: bigint;
			confirmations: number;
			safe: boolean;
		}[] = [];
		for (const tx of Object.values(b.txs)) {
			if (!live(tx)) continue;
			const c = confs(tx);
			tx.outputs.forEach((o, vout) => {
				if (!mine.has(o.address) || spent.has(`${tx.txid}:${vout}`)) return;
				out.push({
					tx,
					vout,
					address: o.address,
					sats: BigInt(o.sats),
					confirmations: c,
					safe: c >= 1 || fromMe(tx, mine),
				});
			});
		}
		return out;
	}

	function parseDesc(desc: string): { tpub: string; branch: number } {
		const m = /^wpkh\(([1-9A-HJ-NP-Za-km-z]+)\/([01])\/\*\)/.exec(
			desc.split("#")[0] as string,
		);
		if (!m) throw new RpcFault(-5, "nur wpkh(tpub/<0|1>/*)");
		return { tpub: m[1] as string, branch: Number(m[2]) };
	}

	const maxRate = (v: unknown) =>
		v === undefined || v === null ? DEFAULT_MAX_FEE_RATE : Number(v);

	function call(method: string, params: unknown[], wallet: string | null) {
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
				requireWallet(wallet);
				const w = b.wallets[
					wallet as string
				] as State["btc"]["wallets"][string];
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
				const mine = requireWallet(wallet);
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
				// wie Bitcoin Core: auch Konflikte und Ersetzte werden gemeldet
				const txids = new Set([
					...b.blocks
						.filter((x) => x.height > fromHeight)
						.flatMap((x) => x.txids),
					...b.mempool,
					...Object.values(b.txs)
						.filter((t) => t.conflicted || (t.replacedBy && !t.block))
						.map((t) => t.txid),
				]);
				const lastHeight = Math.max(0, tip().height - target + 1);
				return {
					transactions: [...txids].flatMap((id) => {
						const tx = b.txs[id];
						return tx ? entries(tx, mine) : [];
					}),
					removed,
					lastblock: (b.blocks[lastHeight] as BtcBlock).hash,
				};
			}
			case "gettransaction": {
				const mine = requireWallet(wallet);
				const tx = b.txs[params[0] as string];
				const relevant =
					tx &&
					(tx.outputs.some((o) => mine.has(o.address)) || debits(tx, mine));
				if (!tx || !relevant)
					throw new RpcFault(-5, "Invalid or non-wallet transaction id");
				const credit = tx.outputs.reduce(
					(s, o) => (mine.has(o.address) ? s + BigInt(o.sats) : s),
					0n,
				);
				const own = fromMe(tx, mine);
				const valueOut = tx.outputs.reduce((s, o) => s + BigInt(o.sats), 0n);
				const blk = tx.block ? blockOf(tx.block) : undefined;
				return {
					amount: btcAmount(own ? credit - valueOut : credit),
					...(own ? { fee: btcAmount(-BigInt(tx.fee)) } : {}),
					confirmations: confs(tx),
					...(blk
						? {
								blockhash: blk.hash,
								blockheight: blk.height,
								blocktime: blk.time,
							}
						: {}),
					txid: tx.txid,
					time: tx.time,
					timereceived: tx.time,
					walletconflicts: [],
					...(tx.replacedBy ? { replaced_by_txid: tx.replacedBy } : {}),
					details: entries(tx, mine),
					hex: tx.hex,
				};
			}
			case "getrawtransaction": {
				const tx = b.txs[params[0] as string];
				if (!tx)
					throw new RpcFault(-5, "No such mempool or blockchain transaction");
				const verbosity = Number(params[1] ?? 0);
				if (verbosity === 0) return tx.hex;
				const blk = tx.block ? blockOf(tx.block) : undefined;
				return {
					txid: tx.txid,
					hex: tx.hex,
					vsize: tx.vsize,
					// Faucet: der angegebene Absender steht als Vorgänger-Adresse
					vin:
						tx.inputs.length === 0
							? [{ prevout: { scriptPubKey: { address: tx.from } } }]
							: tx.inputs.map((i) => ({
									txid: i.txid,
									vout: i.vout,
									prevout: {
										value: btcAmount(
											BigInt(b.txs[i.txid]?.outputs[i.vout]?.sats ?? "0"),
										),
										scriptPubKey: { address: prevAddress(i) },
									},
								})),
					vout: tx.outputs.map((o, n) => ({
						value: btcAmount(BigInt(o.sats)),
						n,
						scriptPubKey: { address: o.address },
					})),
					...(blk ? { blockhash: blk.hash, confirmations: confs(tx) } : {}),
				};
			}
			case "listunspent": {
				const mine = requireWallet(wallet);
				const minconf = Number(params[0] ?? 1);
				const maxconf = Number(params[1] ?? 9_999_999);
				const only = (params[2] as string[] | undefined) ?? [];
				const unsafe = params[3] !== false;
				return unspent(mine)
					.filter(
						(u) =>
							u.confirmations >= minconf &&
							u.confirmations <= maxconf &&
							(unsafe || u.safe) &&
							(only.length === 0 || only.includes(u.address)),
					)
					.map((u) => ({
						txid: u.tx.txid,
						vout: u.vout,
						address: u.address,
						amount: btcAmount(u.sats),
						confirmations: u.confirmations,
						spendable: false,
						solvable: true,
						safe: u.safe,
					}));
			}
			case "getbalance": {
				const mine = requireWallet(wallet);
				const minconf = Number(params[1] ?? 0);
				return btcAmount(
					unspent(mine)
						.filter((u) => u.safe && u.confirmations >= minconf)
						.reduce((s, u) => s + u.sats, 0n),
				);
			}
			case "getbalances": {
				const mine = requireWallet(wallet);
				let trusted = 0n;
				let pending = 0n;
				for (const u of unspent(mine))
					if (u.safe) trusted += u.sats;
					else pending += u.sats;
				return {
					mine: {
						trusted: btcAmount(trusted),
						untrusted_pending: btcAmount(pending),
						immature: btcAmount(0n),
					},
				};
			}
			case "estimatesmartfee": {
				const blocks = Number(params[0] ?? 2);
				if (b.feeRate === null)
					return {
						errors: ["Insufficient data or no feerate found"],
						blocks: 0,
					};
				// sat/vB → BTC/kvB
				return {
					feerate: btcAmount(BigInt(Math.round(b.feeRate * 1000))),
					blocks,
				};
			}
			case "testmempoolaccept": {
				const raws = params[0] as string[];
				if (!Array.isArray(raws) || raws.length !== 1)
					throw new RpcFault(-8, "nur eine Transaktion je Aufruf");
				const v = validate(raws[0] as string, maxRate(params[1]));
				if (!v.ok && v.code === -22) throw new RpcFault(-22, v.reason);
				if (!v.ok)
					return [
						{
							txid: v.txid ?? "",
							allowed: false,
							"reject-reason": v.code === -27 ? "txn-already-known" : v.reason,
						},
					];
				if (v.known)
					return [
						{
							txid: v.txid,
							wtxid: v.wtxid,
							allowed: false,
							"reject-reason": "txn-already-in-mempool",
						},
					];
				return [
					{
						txid: v.txid,
						wtxid: v.wtxid,
						allowed: true,
						vsize: v.vsize,
						fees: { base: btcAmount(v.fee) },
					},
				];
			}
			case "sendrawtransaction":
				return accept(params[0] as string, maxRate(params[1]));
			default:
				throw new Forbidden();
		}
	}

	function mine(n: number) {
		for (let i = 0; i < n; i += 1) {
			const block = {
				hash: rnd(),
				height: tip().height + 1,
				time: nowSec(),
				txids: [...b.mempool],
			};
			for (const id of block.txids) {
				const tx = b.txs[id];
				if (tx) tx.block = block.hash;
			}
			b.mempool = [];
			b.blocks.push(block);
		}
		return tip().height;
	}

	// Faucet: echte Transaktion mit einem Ausgang an `address`
	function faucet(address: string, sats: bigint, from?: string) {
		const { raw, txid } = fundingRaw(address, sats, randomBytes(16));
		b.txs[txid] = {
			txid,
			hex: raw,
			inputs: [],
			outputs: decodeOutputs(raw).map((o) => ({
				address: o.address,
				sats: o.sats.toString(),
			})),
			fee: "0",
			vsize: raw.length / 2,
			from: from ?? "tb1qfaucetfaucetfaucetfaucetfaucetfau0x5tqm",
			block: null,
			time: nowSec(),
		};
		b.mempool.push(txid);
		return txid;
	}

	// letzte Blöcke verwerfen; conflict=false: Transaktionen zurück in den
	// Mempool, sonst Doppelausgabe — Bitcoin Core meldet sie mit
	// Bestätigungen < 0 (auch alles, was auf ihnen aufbaut)
	function reorg(depth: number, conflict: boolean) {
		const dropped = b.blocks.splice(-depth, depth);
		const back: string[] = [];
		for (const blk of dropped) {
			b.orphaned[blk.hash] = blk.txids;
			for (const id of blk.txids) {
				const tx = b.txs[id];
				if (!tx) continue;
				tx.block = null;
				if (conflict) tx.conflicted = true;
				else back.push(id);
			}
		}
		b.mempool = [...back, ...b.mempool];
		evictInvalid();
		mine(depth + 1);
		return { height: tip().height, dropped: dropped.length };
	}

	return { call, mine, faucet, reorg, tip };
}
