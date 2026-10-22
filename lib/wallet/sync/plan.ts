import type { TransferObservation } from "./types";
import { transferKey } from "./types";

// Abgleich gespeicherter Bewegungen mit dem, was der Knoten jetzt meldet:
// neue anlegen, Bestätigungen/Block nachführen, verschwundene (Reorg,
// verdrängt, Konflikt) als „dropped“ markieren — nie löschen.

export type ExistingTransfer = {
	id: string;
	txid: string;
	outputRef: string;
	asset: string;
	status: "pending" | "confirmed" | "dropped";
	confirmations: number;
	blockHeight: number | null;
	blockHash: string | null;
};

export type TransferUpdate = {
	id: string;
	status: "pending" | "confirmed";
	confirmations: number;
	blockHeight: number | null;
	blockHash: string | null;
	blockTime: Date | null;
	becameConfirmed: boolean;
	revived: boolean;
};

export type TransferPlan = {
	inserts: TransferObservation[];
	updates: TransferUpdate[];
	drops: { id: string; txid: string }[];
};

export function planTransfers(
	existing: readonly ExistingTransfer[],
	observed: readonly TransferObservation[],
	opts: {
		// Bitcoin: removed/Konflikt/verdrängt; Ethereum: leer
		goneTxids?: ReadonlySet<string>;
		// Ethereum: neu gelesener Blockbereich — offene Bewegungen darin, die
		// nicht mehr auftauchen, sind durch einen Reorg verschwunden
		rescanned?: { from: number; to: number };
	} = {},
): TransferPlan {
	const byKey = new Map(existing.map((e) => [transferKey(e), e] as const));
	const seen = new Set<string>();
	const plan: TransferPlan = { inserts: [], updates: [], drops: [] };

	for (const o of observed) {
		const key = transferKey(o);
		if (seen.has(key)) continue;
		seen.add(key);
		const e = byKey.get(key);
		if (!e) {
			plan.inserts.push(o);
			continue;
		}
		const changed =
			e.status !== o.status ||
			e.confirmations !== o.confirmations ||
			e.blockHash !== o.blockHash ||
			e.blockHeight !== o.blockHeight;
		if (!changed) continue;
		plan.updates.push({
			id: e.id,
			status: o.status,
			confirmations: o.confirmations,
			blockHeight: o.blockHeight,
			blockHash: o.blockHash,
			blockTime: o.blockTime,
			becameConfirmed: e.status !== "confirmed" && o.status === "confirmed",
			revived: e.status === "dropped",
		});
	}

	for (const e of existing) {
		if (e.status === "dropped" || seen.has(transferKey(e))) continue;
		const gone = opts.goneTxids?.has(e.txid) ?? false;
		const reorged =
			!!opts.rescanned &&
			e.status === "pending" &&
			(e.blockHeight === null ||
				(e.blockHeight >= opts.rescanned.from &&
					e.blockHeight <= opts.rescanned.to));
		if (gone || reorged) plan.drops.push({ id: e.id, txid: e.txid });
	}
	return plan;
}

// Offene Bitcoin-Bewegungen, die der Knoten diesmal nicht gemeldet hat —
// der Lauf fragt sie einzeln nach (gettransaction)
export function unseenPendingTxids(
	existing: readonly ExistingTransfer[],
	observed: readonly TransferObservation[],
): string[] {
	const seen = new Set(observed.map((o) => o.txid));
	return [
		...new Set(
			existing
				.filter((e) => e.status === "pending" && !seen.has(e.txid))
				.map((e) => e.txid),
		),
	];
}
