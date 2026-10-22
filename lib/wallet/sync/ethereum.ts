import type { AssetInfo } from "../core/assets";
import {
	type EthLog,
	type EthTrace,
	hexToBigInt,
	hexToNumber,
	TRANSFER_TOPIC,
	topicAddress,
} from "../rpc/ethereum";
import type { TransferObservation } from "./types";

// trace_filter + Transfer-Logs → Bewegungen. ETH zählt nur, wenn Wert
// wirklich fließt: `call` (nicht delegatecall/staticcall/callcode) oder
// Selbstzerstörung an die eigene Adresse; nie aus einer gescheiterten
// Transaktion und nie aus einem Aufruf, dessen Rahmen (oder ein
// übergeordneter) zurückgerollt wurde. Token nur von fest hinterlegten
// Verträgen — Name oder Symbol eines Vertrags beweisen nichts.

export type EthSyncInput = {
	ours: ReadonlySet<string>; // klein geschrieben
	traces: readonly EthTrace[];
	logs: readonly EthLog[];
	tokens: ReadonlyMap<string, AssetInfo>; // Vertrag (klein) → Asset
	revertedTxs: ReadonlySet<string>;
	// je Transaktion die Pfade der Rahmen mit Fehler (aus trace_transaction)
	erroredFrames: ReadonlyMap<string, readonly (readonly number[])[]>;
	// Gebühr je eigener Transaktion (Absender = eigene Adresse) — auch bei
	// gescheiterten Transaktionen, Gas ist trotzdem bezahlt
	fees: ReadonlyMap<
		string,
		{ fee: bigint; from: string; blockHeight: number; blockHash: string }
	>;
	blockTimes: ReadonlyMap<string, Date>; // Block-Hash → Zeit
	finalizedHeight: number;
	latestHeight: number;
};

const lower = (s: string | undefined) => (s ?? "").toLowerCase();

const isPrefix = (prefix: readonly number[], path: readonly number[]) =>
	prefix.length <= path.length && prefix.every((v, i) => path[i] === v);

export function frameReverted(
	trace: Pick<EthTrace, "traceAddress" | "error" | "transactionHash">,
	erroredFrames: EthSyncInput["erroredFrames"],
): boolean {
	if (trace.error) return true;
	const errs = erroredFrames.get(lower(trace.transactionHash));
	return !!errs?.some((p) => isPrefix(p, trace.traceAddress));
}

// Wertfluss eines Trace: von → an, Betrag in Wei (oder null ohne Wert)
export function traceValueFlow(
	t: EthTrace,
): { from: string; to: string; value: bigint } | null {
	if (t.type === "call") {
		const ct = t.action.callType ?? "call";
		if (ct !== "call") return null;
		const value = hexToBigInt(t.action.value ?? "0x0");
		if (value === 0n) return null;
		return { from: lower(t.action.from), to: lower(t.action.to), value };
	}
	if (t.type === "suicide") {
		const value = hexToBigInt(t.action.balance ?? "0x0");
		if (value === 0n) return null;
		return {
			from: lower(t.action.address),
			to: lower(t.action.refundAddress),
			value,
		};
	}
	return null;
}

export function ethObservations(input: EthSyncInput): TransferObservation[] {
	const out: TransferObservation[] = [];
	const status = (height: number) =>
		height <= input.finalizedHeight
			? ("confirmed" as const)
			: ("pending" as const);
	const confirmations = (height: number) =>
		Math.max(0, input.latestHeight - height + 1);

	const seenTrace = new Set<string>();
	for (const t of input.traces) {
		const txid = lower(t.transactionHash);
		if (!txid || input.revertedTxs.has(txid)) continue;
		if (frameReverted(t, input.erroredFrames)) continue;
		const flow = traceValueFlow(t);
		if (!flow) continue;
		const ref = `trace:${["r", ...t.traceAddress].join(".")}`;
		const key = `${txid}|${ref}`;
		if (seenTrace.has(key)) continue;
		seenTrace.add(key);
		const base = {
			asset: "ETH" as const,
			amount: flow.value,
			txid,
			blockHeight: t.blockNumber,
			blockHash: lower(t.blockHash),
			blockTime: input.blockTimes.get(lower(t.blockHash)) ?? null,
			confirmations: confirmations(t.blockNumber),
			status: status(t.blockNumber),
		};
		if (input.ours.has(flow.to))
			out.push({
				...base,
				direction: "in",
				outputRef: `in:${ref}`,
				address: flow.to,
				counterparty: flow.from || null,
			});
		if (input.ours.has(flow.from))
			out.push({
				...base,
				direction: "out",
				outputRef: `out:${ref}`,
				address: flow.from,
				counterparty: flow.to || null,
			});
	}

	for (const log of input.logs) {
		if (log.removed) continue;
		const asset = input.tokens.get(lower(log.address));
		if (!asset) continue;
		if (lower(log.topics[0]) !== TRANSFER_TOPIC || log.topics.length !== 3)
			continue;
		const txid = lower(log.transactionHash);
		if (input.revertedTxs.has(txid)) continue;
		const from = topicAddress(log.topics[1] as string);
		const to = topicAddress(log.topics[2] as string);
		const amount = hexToBigInt(log.data);
		if (amount === 0n) continue;
		const height = hexToNumber(log.blockNumber);
		const idx = hexToNumber(log.logIndex);
		const base = {
			asset: asset.code,
			amount,
			txid,
			blockHeight: height,
			blockHash: lower(log.blockHash),
			blockTime: input.blockTimes.get(lower(log.blockHash)) ?? null,
			confirmations: confirmations(height),
			status: status(height),
		};
		if (input.ours.has(to))
			out.push({
				...base,
				direction: "in",
				outputRef: `in:log:${idx}`,
				address: to,
				counterparty: from,
			});
		if (input.ours.has(from))
			out.push({
				...base,
				direction: "out",
				outputRef: `out:log:${idx}`,
				address: from,
				counterparty: to,
			});
	}

	for (const [txid, f] of input.fees) {
		if (f.fee === 0n) continue;
		out.push({
			direction: "out",
			asset: "ETH",
			amount: f.fee,
			txid,
			outputRef: "out:fee",
			address: lower(f.from),
			counterparty: null,
			blockHeight: f.blockHeight,
			blockHash: lower(f.blockHash),
			blockTime: input.blockTimes.get(lower(f.blockHash)) ?? null,
			confirmations: confirmations(f.blockHeight),
			status: status(f.blockHeight),
		});
	}
	return out;
}

// Transaktionen, die eine eigene Adresse selbst abgeschickt hat (oberster
// Aufruf von ihr, mit oder ohne Wert): für sie ist die Gebühr zu buchen
export function ownSentTxids(
	traces: readonly EthTrace[],
	ours: ReadonlySet<string>,
): string[] {
	return [
		...new Set(
			traces
				.filter(
					(t) =>
						t.traceAddress.length === 0 &&
						t.transactionHash &&
						ours.has(lower(t.action.from)),
				)
				.map((t) => lower(t.transactionHash)),
		),
	];
}

// Scan-Fenster: nicht finalisierte Blöcke werden jedes Mal neu gelesen
// (Reorg), dazu höchstens `maxBlocks` neue finale Blöcke je Lauf.
export function ethScanRange(input: {
	syncHeight: number | null; // höchster gelesener, finaler Block
	startHeight: number;
	finalizedHeight: number;
	latestHeight: number;
	maxBlocks: number;
}): { from: number; to: number; nextSyncHeight: number } | null {
	const from = Math.max(
		(input.syncHeight ?? input.startHeight - 1) + 1,
		input.startHeight,
	);
	if (from > input.latestHeight) return null;
	const to = Math.min(input.latestHeight, from + input.maxBlocks - 1);
	return {
		from,
		to,
		nextSyncHeight: Math.max(
			input.syncHeight ?? input.startHeight - 1,
			Math.min(to, input.finalizedHeight),
		),
	};
}

// Bereich in Stücke für trace_filter (Reth: höchstens 100 Blöcke je Aufruf)
export function chunks(
	from: number,
	to: number,
	size: number,
): [number, number][] {
	const out: [number, number][] = [];
	for (let a = from; a <= to; a += size)
		out.push([a, Math.min(to, a + size - 1)]);
	return out;
}
