import { assetOf } from "../../lib/wallet/core/assets";
import { NETWORKS } from "../../lib/wallet/core/networks";
import { decodeEthTx, decodeTransfer } from "./eth-tx";
import { FEED_BY_ADDRESS, feedCall } from "./feeds";
import {
	type EthBlock,
	type EthTransfer,
	type EthTx,
	nowSec,
	RpcFault,
	rnd,
	type State,
} from "./state";

// Reth-Nachbau (Sepolia) der lokalen Testkette: Blöcke mit latest/finalized
// und Basisgebühr, trace_filter/trace_transaction, Transfer-Logs, Salden,
// balanceOf, Chainlink-Feeds — und Senden wie ein Knoten: Signatur und
// chainId, Nonces (latest/pending), Ersetzen nur mit +10 % Gebühr, Gas
// (Grundgebühr + Calldata, Token-Aufruf), Guthaben für Gas × Preis + Wert,
// Zurückrollen (Guthaben, Circle-Sperrliste, zu wenig Gas), Quittungen.

const CHAIN_ID = NETWORKS.ethereum_sepolia.chainId as number;
const FINALITY_LAG = 2; // finalized = Spitze − 2
const TOKEN_EXEC_GAS = 30_000n;
const REVERT_GAS = 2_000n;
const BLOCK_GAS_LIMIT = 30_000_000n;
const FAKE_CODE = "0x6080604052348015600f57600080fd5b50";

const lc = (s: string) => s.toLowerCase();
const h = (n: number | bigint) => `0x${n.toString(16)}`;
const pad = (a: string) => `0x${lc(a).replace(/^0x/, "").padStart(64, "0")}`;
const TRANSFER =
	"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ROUTER = `0x${"c0ffee".padStart(40, "0")}`;

const TOKEN_OF: Record<string, "USDC" | "EURC"> = {};
for (const code of ["USDC", "EURC"] as const) {
	const c = assetOf("ethereum_sepolia", code)?.contract;
	if (c) TOKEN_OF[lc(c)] = code;
}
const CONTRACT = (code: "USDC" | "EURC") =>
	lc(assetOf("ethereum_sepolia", code)?.contract as string);

// EIP-2028: 21000 + 4 Gas je Null-Byte, 16 je anderem Byte der Calldata
export function intrinsicGas(data: string): bigint {
	const d = data.replace(/^0x/, "");
	let gas = 21_000n;
	for (let i = 0; i < d.length; i += 2)
		gas += d.slice(i, i + 2) === "00" ? 4n : 16n;
	return gas;
}

export function ethChain(state: State) {
	const e = state.eth;
	const tip = () => e.blocks[e.blocks.length - 1] as EthBlock;
	const resolveTag = (tag: string) =>
		tag === "latest" || tag === "pending"
			? tip().number
			: tag === "finalized" || tag === "safe"
				? Math.max(0, tip().number - FINALITY_LAG)
				: tag === "earliest"
					? 0
					: Number(BigInt(tag));
	const blockJson = (b: EthBlock) => ({
		number: h(b.number),
		hash: b.hash,
		parentHash: b.parent,
		timestamp: h(b.time),
		baseFeePerGas: h(BigInt(b.baseFee)),
	});
	const blocked = (a: string) => e.blacklist.includes(lc(a));
	const isContract = (a: string) =>
		TOKEN_OF[lc(a)] !== undefined || FEED_BY_ADDRESS.has(lc(a));

	function balance(address: string, asset: string, upTo: number): bigint {
		let sum = 0n;
		for (const t of e.transfers) {
			if (t.asset !== asset || t.block > upTo) continue;
			if (lc(t.to) === lc(address)) sum += BigInt(t.value);
			if (lc(t.from) === lc(address)) sum -= BigInt(t.value);
		}
		if (asset === "ETH")
			for (const tx of Object.values(e.txs))
				if (tx.block !== null && tx.block <= upTo && tx.from === lc(address))
					sum -=
						BigInt(tx.gasUsed ?? "0") * BigInt(tx.effectiveGasPrice ?? "0");
		return sum;
	}

	const minedNonce = (address: string, upTo = Number.POSITIVE_INFINITY) =>
		Object.values(e.txs).filter(
			(tx) => tx.from === lc(address) && tx.block !== null && tx.block <= upTo,
		).length;
	function pendingNonce(address: string) {
		let n = minedNonce(address);
		const queued = new Set(
			e.pool
				.map((x) => e.txs[x])
				.filter((tx): tx is EthTx => tx?.from === lc(address))
				.map((tx) => tx.nonce),
		);
		while (queued.has(n)) n += 1;
		return n;
	}

	// Ausführung eines Token-Aufrufs (wie FiatTokenV2 von Circle)
	function tokenOutcome(
		contract: string,
		from: string,
		value: bigint,
		data: string,
	): { ok: true; to: string; amount: bigint } | { ok: false; reason: string } {
		const code = TOKEN_OF[lc(contract)] as "USDC" | "EURC";
		const call = decodeTransfer(data);
		if (!call || value > 0n) return { ok: false, reason: "execution reverted" };
		if (blocked(from) || blocked(call.to))
			return {
				ok: false,
				reason: "execution reverted: Blacklistable: account is blacklisted",
			};
		if (balance(from, code, Number.POSITIVE_INFINITY) < call.amount)
			return {
				ok: false,
				reason: "execution reverted: ERC20: transfer amount exceeds balance",
			};
		return { ok: true, to: lc(call.to), amount: call.amount };
	}

	function execute(
		tx: EthTx,
		block: number,
		baseFee: bigint,
		logIndex: number,
	) {
		const price = (() => {
			const cap = BigInt(tx.maxFeePerGas);
			const want = baseFee + BigInt(tx.maxPriorityFeePerGas);
			return cap < want ? cap : want;
		})();
		const gasLimit = BigInt(tx.gasLimit);
		const intrinsic = intrinsicGas(tx.data);
		let gasUsed = intrinsic;
		let status: 0 | 1 = 1;
		let reason: string | undefined;
		const token = TOKEN_OF[tx.to];
		if (token) {
			if (gasLimit < intrinsic + TOKEN_EXEC_GAS) {
				status = 0;
				gasUsed = gasLimit;
				reason = "out of gas";
			} else {
				const r = tokenOutcome(tx.to, tx.from, BigInt(tx.value), tx.data);
				if (r.ok) {
					gasUsed = intrinsic + TOKEN_EXEC_GAS;
					e.transfers.push({
						hash: tx.hash,
						kind: "token",
						asset: token,
						from: tx.from,
						to: r.to,
						value: r.amount.toString(),
						block,
						logIndex,
					});
				} else {
					status = 0;
					reason = r.reason;
					gasUsed = intrinsic + REVERT_GAS;
				}
			}
		} else if (FEED_BY_ADDRESS.has(tx.to)) {
			status = 0;
			reason = "execution reverted";
			gasUsed = intrinsic + REVERT_GAS;
		} else if (BigInt(tx.value) > 0n) {
			e.transfers.push({
				hash: tx.hash,
				kind: "eth",
				asset: "ETH",
				from: tx.from,
				to: tx.to,
				value: tx.value,
				block,
				logIndex: 0,
			});
		}
		if (gasUsed > gasLimit) gasUsed = gasLimit;
		tx.block = block;
		tx.status = status;
		tx.gasUsed = gasUsed.toString();
		tx.effectiveGasPrice = price.toString();
		if (reason) tx.revertReason = reason;
		return status === 1 && token ? 1 : 0;
	}

	function mine(n: number) {
		for (let i = 0; i < n; i += 1) {
			const prev = tip();
			const baseFee = BigInt(e.baseFee);
			const number = prev.number + 1;
			e.blocks.push({
				number,
				hash: `0x${rnd()}`,
				parent: prev.hash,
				time: Math.max(nowSec(), prev.time + 12),
				baseFee: baseFee.toString(),
			});
			// ausführbar: nächste Nonce, Höchstgebühr ≥ Basisgebühr, Guthaben
			// für Gas × Höchstgebühr + Wert (sonst bleibt sie im Pool hängen)
			let logIndex = 0;
			let progressed = true;
			while (progressed) {
				progressed = false;
				for (const hash of [...e.pool]) {
					const tx = e.txs[hash] as EthTx;
					if (tx.nonce !== minedNonce(tx.from)) continue;
					if (BigInt(tx.maxFeePerGas) < baseFee) continue;
					const cost =
						BigInt(tx.gasLimit) * BigInt(tx.maxFeePerGas) + BigInt(tx.value);
					if (balance(tx.from, "ETH", Number.POSITIVE_INFINITY) < cost)
						continue;
					logIndex += execute(tx, number, baseFee, logIndex);
					e.pool = e.pool.filter((x) => x !== hash);
					progressed = true;
				}
			}
		}
		return tip().number;
	}

	function sendRaw(raw: string): string {
		const d = decodeEthTx(raw, CHAIN_ID);
		if ("error" in d) throw new RpcFault(-32000, d.error);
		const known = e.txs[d.hash];
		if (known && e.pool.includes(d.hash))
			throw new RpcFault(-32000, "already known");
		const next = minedNonce(d.from);
		if (d.nonce < next)
			throw new RpcFault(
				-32000,
				`nonce too low: next nonce ${next}, tx nonce ${d.nonce}`,
			);
		const intrinsic = intrinsicGas(d.data);
		if (d.gasLimit < intrinsic)
			throw new RpcFault(
				-32000,
				`intrinsic gas too low: gas ${d.gasLimit}, minimum needed ${intrinsic}`,
			);
		if (d.gasLimit > BLOCK_GAS_LIMIT)
			throw new RpcFault(-32000, "exceeds block gas limit");
		if (d.maxPriorityFeePerGas > d.maxFeePerGas)
			throw new RpcFault(
				-32000,
				"max priority fee per gas higher than max fee per gas",
			);
		const cost = d.gasLimit * d.maxFeePerGas + d.value;
		const have = balance(d.from, "ETH", Number.POSITIVE_INFINITY);
		if (have < cost)
			throw new RpcFault(
				-32000,
				`insufficient funds for gas * price + value: balance ${have}, tx cost ${cost}, overshot ${cost - have}`,
			);
		// gleiche Nonce im Pool: Ersetzen nur mit mindestens 10 % mehr
		const same = e.pool.find((x) => {
			const tx = e.txs[x];
			return tx?.from === d.from && tx.nonce === d.nonce;
		});
		if (same) {
			const old = e.txs[same] as EthTx;
			if (
				d.maxFeePerGas * 10n < BigInt(old.maxFeePerGas) * 11n ||
				d.maxPriorityFeePerGas * 10n < BigInt(old.maxPriorityFeePerGas) * 11n
			)
				throw new RpcFault(-32000, "replacement transaction underpriced");
			old.replacedBy = d.hash;
			e.pool = e.pool.filter((x) => x !== same);
		}
		e.txs[d.hash] = {
			hash: d.hash,
			raw: raw.toLowerCase(),
			from: d.from,
			to: d.to,
			nonce: d.nonce,
			value: d.value.toString(),
			data: d.data,
			gasLimit: d.gasLimit.toString(),
			maxFeePerGas: d.maxFeePerGas.toString(),
			maxPriorityFeePerGas: d.maxPriorityFeePerGas.toString(),
			arrival: Date.now(),
			block: null,
		};
		e.pool.push(d.hash);
		return d.hash;
	}

	function estimateGas(call: {
		from?: string;
		to?: string;
		value?: string;
		data?: string;
	}): bigint {
		const from = lc(call.from ?? `0x${"0".repeat(40)}`);
		const to = lc(call.to ?? "");
		const value = call.value ? BigInt(call.value) : 0n;
		const data = (call.data ?? "").replace(/^0x/, "");
		const intrinsic = intrinsicGas(data);
		if (TOKEN_OF[to]) {
			const r = tokenOutcome(to, from, value, data);
			if (!r.ok) throw new RpcFault(3, r.reason);
			return intrinsic + TOKEN_EXEC_GAS;
		}
		if (FEED_BY_ADDRESS.has(to)) throw new RpcFault(3, "execution reverted");
		if (balance(from, "ETH", Number.POSITIVE_INFINITY) < value)
			throw new RpcFault(-32000, "insufficient funds for transfer");
		return intrinsic;
	}

	function traceOf(t: EthTransfer) {
		const b = e.blocks[t.block] as EthBlock;
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

	const tokenLog = (t: EthTransfer) => ({
		address: CONTRACT(t.asset as "USDC" | "EURC"),
		topics: [TRANSFER, pad(t.from), pad(t.to)],
		data: pad(h(BigInt(t.value))),
		blockNumber: h(t.block),
		blockHash: (e.blocks[t.block] as EthBlock).hash,
		transactionHash: t.hash,
		logIndex: h(t.logIndex),
	});

	function call(method: string, params: unknown[]): unknown {
		switch (method) {
			case "eth_chainId":
				return h(CHAIN_ID);
			case "eth_blockNumber":
				return h(tip().number);
			case "eth_getBlockByNumber": {
				const b = e.blocks[resolveTag(params[0] as string)];
				return b ? blockJson(b) : null;
			}
			case "eth_gasPrice":
				return h(BigInt(e.baseFee) + BigInt(e.tip));
			case "eth_maxPriorityFeePerGas":
				return h(BigInt(e.tip));
			case "eth_feeHistory": {
				const count = Math.min(1024, Number(BigInt(params[0] as string)));
				const newest = resolveTag(params[1] as string);
				const oldest = Math.max(0, newest - count + 1);
				const range = e.blocks.slice(oldest, newest + 1);
				const percentiles = (params[2] as number[] | undefined) ?? null;
				return {
					oldestBlock: h(oldest),
					baseFeePerGas: [
						...range.map((b) => h(BigInt(b.baseFee))),
						h(BigInt(e.baseFee)),
					],
					gasUsedRatio: range.map(() => 0.5),
					...(percentiles
						? {
								reward: range.map(() =>
									percentiles.map(() => h(BigInt(e.tip))),
								),
							}
						: {}),
				};
			}
			case "eth_getTransactionCount": {
				const tag = params[1] as string;
				return h(
					tag === "pending"
						? pendingNonce(params[0] as string)
						: minedNonce(params[0] as string, resolveTag(tag)),
				);
			}
			case "eth_getCode":
				return isContract(params[0] as string) ? FAKE_CODE : "0x";
			case "eth_estimateGas":
				return h(
					estimateGas(
						params[0] as {
							from?: string;
							to?: string;
							value?: string;
							data?: string;
						},
					),
				);
			case "eth_sendRawTransaction":
				return sendRaw(params[0] as string);
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
				return [
					root,
					...list.filter((t) => t.kind === "internal").map(traceOf),
				];
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
							f.address
								.map(lc)
								.includes(CONTRACT(t.asset as "USDC" | "EURC")) &&
							match(0, TRANSFER) &&
							match(1, pad(t.from)) &&
							match(2, pad(t.to)),
					)
					.map(tokenLog);
			}
			case "eth_getTransactionReceipt": {
				const sent = e.txs[params[0] as string];
				if (sent) {
					if (sent.block === null) return null;
					const b = e.blocks[sent.block] as EthBlock;
					return {
						transactionHash: sent.hash,
						type: "0x2",
						status: h(sent.status ?? 0),
						from: sent.from,
						to: sent.to,
						gasUsed: h(BigInt(sent.gasUsed ?? "0")),
						effectiveGasPrice: h(BigInt(sent.effectiveGasPrice ?? "0")),
						blockNumber: h(sent.block),
						blockHash: b.hash,
						logs: e.transfers
							.filter((t) => t.hash === sent.hash && t.kind === "token")
							.map(tokenLog),
					};
				}
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
				const sent = e.txs[params[0] as string];
				if (sent) {
					// ersetzte Transaktionen kennt der Knoten nicht mehr
					if (sent.block === null && !e.pool.includes(sent.hash)) return null;
					return {
						hash: sent.hash,
						type: "0x2",
						chainId: h(CHAIN_ID),
						from: sent.from,
						to: sent.to,
						nonce: h(sent.nonce),
						value: h(BigInt(sent.value)),
						input: sent.data ? `0x${sent.data}` : "0x",
						gas: h(BigInt(sent.gasLimit)),
						maxFeePerGas: h(BigInt(sent.maxFeePerGas)),
						maxPriorityFeePerGas: h(BigInt(sent.maxPriorityFeePerGas)),
						blockNumber: sent.block === null ? null : h(sent.block),
						blockHash:
							sent.block === null
								? null
								: (e.blocks[sent.block] as EthBlock).hash,
					};
				}
				const t = e.transfers.find((x) => x.hash === params[0]);
				return t ? { hash: t.hash, from: t.from } : null;
			}
			case "eth_getBalance":
				return h(
					balance(params[0] as string, "ETH", resolveTag(params[1] as string)),
				);
			case "eth_call": {
				const c = params[0] as { to: string; data: string };
				const feed = FEED_BY_ADDRESS.get(lc(c.to));
				if (feed) return feedCall(feed.key, feed.description, c.data);
				const code = TOKEN_OF[lc(c.to)];
				if (!code) throw new RpcFault(-32000, "execution reverted");
				// decimals() und symbol() wie bei Circle (6 Stellen)
				if (c.data === "0x313ce567") return pad(h(6));
				if (c.data === "0x95d89b41") {
					const hex = Buffer.from(code, "utf8").toString("hex");
					return `0x${"20".padStart(64, "0")}${h(code.length).slice(2).padStart(64, "0")}${hex.padEnd(64, "0")}`;
				}
				if (!c.data.startsWith("0x70a08231"))
					throw new RpcFault(-32000, "execution reverted");
				const holder = `0x${c.data.slice(-40)}`;
				return pad(h(balance(holder, code, resolveTag(params[1] as string))));
			}
			default:
				throw new RpcFault(-32601, `the method ${method} does not exist`);
		}
	}

	// Faucet: Eingang in einem neuen Block (ETH direkt, über einen Vertrag
	// oder als Token-Transfer); amount in Basiseinheiten
	function faucet(input: {
		address: string;
		asset?: EthTransfer["asset"];
		amount?: string;
		viaContract?: boolean;
		from?: string;
	}) {
		mine(1);
		const asset = input.asset ?? "ETH";
		const kind: EthTransfer["kind"] =
			asset !== "ETH" ? "token" : input.viaContract ? "internal" : "eth";
		const t: EthTransfer = {
			hash: `0x${rnd()}`,
			kind,
			asset,
			from:
				kind === "internal"
					? ROUTER
					: lc(input.from ?? `0x${"fa0ce7".padStart(40, "0")}`),
			to: lc(input.address),
			value:
				input.amount ?? (asset === "ETH" ? "100000000000000000" : "5000000"),
			block: tip().number,
			logIndex: 0,
		};
		e.transfers.push(t);
		return { hash: t.hash, block: t.block };
	}

	return { call, mine, faucet, tip, balance };
}
