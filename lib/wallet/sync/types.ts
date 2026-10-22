import type { AssetCode } from "../core/assets";

// Eine beobachtete Bewegung auf der Kette, wie sie der Knoten meldet.
// `outputRef` beginnt mit der Richtung („in:“/„out:“), damit eine
// Überweisung an sich selbst als Eingang und Ausgang bestehen kann.
export type TransferObservation = {
	direction: "in" | "out";
	asset: AssetCode;
	amount: bigint;
	txid: string;
	outputRef: string;
	// eigene Adresse (Eingang) bzw. leer, wenn der Knoten sie nicht nennt
	address: string;
	counterparty: string | null;
	blockHeight: number | null;
	blockHash: string | null;
	blockTime: Date | null;
	confirmations: number;
	status: "pending" | "confirmed";
};

export const transferKey = (t: {
	txid: string;
	outputRef: string;
	asset: string;
}) => `${t.txid}|${t.outputRef}|${t.asset}`;
