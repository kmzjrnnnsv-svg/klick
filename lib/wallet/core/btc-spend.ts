import { hex } from "@scure/base";
import {
	NETWORK,
	p2wpkh,
	SigHash,
	TEST_NETWORK,
	Transaction,
} from "@scure/btc-signer";
import { checkAddress } from "./address";
import { DUST_P2WPKH } from "./coin-select";
import { NETWORKS, type WalletNetwork } from "./networks";

// Bitcoin-Auszahlung bauen und signieren (rein; läuft im Signer). Die App
// liefert nur den Ausgabeplan (Eingänge mit vollständiger Vorgänger-
// Transaktion, Gebühr); Ziel und Betrag kommen aus der freigegebenen
// Absicht, das Wechselgeld geht an einen Index, den der Signer vergibt.
// Jeder Eingang muss zu einem selbst abgeleiteten Schlüssel gehören.

export const RBF_SEQUENCE = 0xfffffffd;

export type BtcSpendInput = {
	txid: string;
	vout: number;
	prevTxHex: string;
	branch: 0 | 1;
	index: number;
};

export type BtcSpendRequest = {
	network: WalletNetwork;
	destination: string;
	amount: bigint;
	inputs: readonly BtcSpendInput[];
	// Index auf Zweig 1; null nur, wenn kein Wechselgeld entsteht
	changeIndex: number | null;
	fee: bigint;
	feeCap: bigint;
	maxSatPerVb: number;
};

export type BtcKey = { priv: Uint8Array; pub: Uint8Array };

export type BtcSpend = {
	raw: string;
	txid: string;
	vsize: number;
	fee: bigint;
	change: bigint;
	outpoints: string[];
};

export class SpendError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const fail = (code: string): never => {
	throw new SpendError(code);
};

export function buildBtcSpend(
	req: BtcSpendRequest,
	keyAt: (branch: 0 | 1, index: number) => BtcKey,
): BtcSpend {
	const info = NETWORKS[req.network];
	if (info.chain !== "bitcoin") fail("network");
	const net = info.bech32 === "bc" ? NETWORK : TEST_NETWORK;
	const dest = checkAddress(req.network, req.destination);
	if (!dest.ok || dest.address !== req.destination) fail("destination");
	if (req.amount <= 0n) fail("amount");
	if (req.inputs.length === 0 || req.inputs.length > 200) fail("inputs");
	if (req.fee < 0n || req.fee > req.feeCap) fail("fee_cap");

	const tx = new Transaction({ strictPrevoutValidation: true, lowR: true });
	const seen = new Set<string>();
	let total = 0n;
	const keys: BtcKey[] = [];
	for (const input of req.inputs) {
		const outpoint = `${input.txid}:${input.vout}`;
		if (seen.has(outpoint)) fail("duplicate_input");
		seen.add(outpoint);
		if (!/^[0-9a-f]{64}$/.test(input.txid)) fail("txid");
		const prev = Transaction.fromRaw(hex.decode(input.prevTxHex), {
			allowUnknownOutputs: true,
		});
		if (prev.id !== input.txid) fail("prev_tx");
		const out = prev.getOutput(input.vout);
		if (!out?.script || out.amount === undefined) fail("prev_output");
		const key = keyAt(input.branch, input.index);
		const expected = p2wpkh(key.pub, net).script;
		if (hex.encode(out.script as Uint8Array) !== hex.encode(expected))
			fail("foreign_input");
		tx.addInput({
			txid: input.txid,
			index: input.vout,
			nonWitnessUtxo: input.prevTxHex,
			witnessUtxo: { script: expected, amount: out.amount as bigint },
			sequence: RBF_SEQUENCE,
		});
		keys.push(key);
		total += out.amount as bigint;
	}

	const change = total - req.amount - req.fee;
	if (change < 0n) fail("insufficient");
	tx.addOutputAddress(req.destination, req.amount, net);
	if (change > 0n) {
		if (change < DUST_P2WPKH) fail("dust_change");
		if (req.changeIndex === null) fail("change_index");
		const changeKey = keyAt(1, req.changeIndex as number);
		tx.addOutput({ script: p2wpkh(changeKey.pub, net).script, amount: change });
	}
	keys.forEach((k, i) => {
		tx.signIdx(k.priv, i, [SigHash.ALL]);
	});
	tx.finalize();
	if (tx.fee !== req.fee) fail("fee_mismatch");
	const vsize = tx.vsize;
	if (Number(req.fee) / vsize > req.maxSatPerVb) fail("fee_rate");
	return {
		raw: hex.encode(tx.extract()),
		txid: tx.id,
		vsize,
		fee: req.fee,
		change,
		outpoints: [...seen],
	};
}
