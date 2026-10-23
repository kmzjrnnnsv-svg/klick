import type { BtcSinceBlock } from "../rpc/bitcoin";
import { btcToSats } from "../rpc/bitcoin";
import type { TransferObservation } from "./types";

// listsinceblock → Bewegungen. Eingänge nur an eigene Adressen; Ausgänge
// (z. B. von der Hardware-Wallet aus gesendet) mit Ziel als Gegenpartei und
// der Gebühr als eigener Position, damit die Summe dem Bestand entspricht.
// Reorg: `removed` und Konflikte (Bestätigungen < 0) fallen heraus, ebenso
// unbestätigte Transaktionen, die eine Gebührenerhöhung (RBF) ersetzt hat.

export function btcObservations(
	since: BtcSinceBlock,
	opts: { ours: ReadonlySet<string>; finality: number },
): { observations: TransferObservation[]; goneTxids: Set<string> } {
	const out: TransferObservation[] = [];
	const gone = new Set<string>();
	const seen = new Set<string>();
	const feeDone = new Set<string>();
	for (const e of since.transactions) {
		const replaced =
			e.confirmations === 0 &&
			(Boolean(e.replaced_by_txid) || (e.mempoolconflicts?.length ?? 0) > 0);
		if (e.confirmations < 0 || e.abandoned || replaced) {
			gone.add(e.txid);
			continue;
		}
		seen.add(e.txid);
		const base = {
			asset: "BTC" as const,
			txid: e.txid,
			blockHeight: e.blockheight ?? null,
			blockHash: e.blockhash ?? null,
			blockTime: e.blocktime ? new Date(e.blocktime * 1000) : null,
			confirmations: e.confirmations,
			status:
				e.confirmations >= opts.finality
					? ("confirmed" as const)
					: ("pending" as const),
		};
		if (e.category === "receive") {
			const address = (e.address ?? "").toLowerCase();
			if (!opts.ours.has(address)) continue;
			out.push({
				...base,
				direction: "in",
				amount: btcToSats(e.amount),
				outputRef: `in:vout:${e.vout}`,
				address,
				counterparty: null,
			});
		} else if (e.category === "send") {
			out.push({
				...base,
				direction: "out",
				amount: -btcToSats(e.amount),
				outputRef: `out:vout:${e.vout}`,
				address: "",
				counterparty: e.address?.toLowerCase() ?? null,
			});
			if (e.fee && !feeDone.has(e.txid)) {
				feeDone.add(e.txid);
				const fee = -btcToSats(e.fee);
				if (fee > 0n)
					out.push({
						...base,
						direction: "out",
						amount: fee,
						outputRef: "out:fee",
						address: "",
						counterparty: null,
					});
			}
		}
		// generate/immature/orphan: Mining kommt hier nicht vor
	}
	for (const r of since.removed ?? []) if (!seen.has(r.txid)) gone.add(r.txid);
	return { observations: out, goneTxids: gone };
}

// Fenster für listsinceblock: so viele Blöcke bleiben offen, dass jede noch
// nicht final bestätigte Zahlung erneut gemeldet wird.
export const btcWindow = (finality: number) => Math.max(finality, 6);
