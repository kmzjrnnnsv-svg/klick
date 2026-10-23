import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import {
	Address,
	OutScript,
	RawTx,
	SigHash,
	TEST_NETWORK,
	Transaction,
} from "@scure/btc-signer";

// Bitcoin-Transaktionen der lokalen Testkette (rein, getestet): echte
// Roh-Transaktionen für Faucet-Zahlungen und eine Prüfung eingehender
// Transaktionen wie ein Knoten — Eingänge vorhanden und unverbraucht,
// P2WPKH-Signaturen (BIP-143, SIGHASH_ALL) gültig, Summen stimmen.

export type Prevout = { script: Uint8Array; sats: bigint };
// type: Skripttyp (wpkh, tr, wsh, pkh, sh …) für die Dust-Grenze
export type DecodedOutput = { address: string; sats: bigint; type: string };

const hash160 = (b: Uint8Array) => ripemd160(sha256(b));

export function addressOfScript(script: Uint8Array): string {
	try {
		return Address(TEST_NETWORK).encode(OutScript.decode(script));
	} catch {
		return "";
	}
}

// Faucet-Zahlung als echte Transaktion (Eingang aus dem Nichts, wie Coinbase)
export function fundingRaw(
	address: string,
	sats: bigint,
	salt: Uint8Array,
): { raw: string; txid: string } {
	const script = OutScript.encode(Address(TEST_NETWORK).decode(address));
	const raw = RawTx.encode({
		version: 2,
		segwitFlag: false,
		inputs: [
			{
				txid: sha256(salt),
				index: 0xffffffff,
				finalScriptSig: salt,
				sequence: 0xffffffff,
			},
		],
		outputs: [{ script, amount: sats }],
		witnesses: [],
		lockTime: 0,
	});
	return { raw: hex.encode(raw), txid: Transaction.fromRaw(raw).id };
}

const scriptType = (script: Uint8Array) => {
	try {
		return OutScript.decode(script).type;
	} catch {
		return "unknown";
	}
};

export function decodeOutputs(raw: string): DecodedOutput[] {
	const tx = Transaction.fromRaw(hex.decode(raw), {
		allowUnknownOutputs: true,
	});
	const out: DecodedOutput[] = [];
	for (let i = 0; i < tx.outputsLength; i += 1) {
		const o = tx.getOutput(i);
		out.push({
			address: addressOfScript(o.script as Uint8Array),
			sats: o.amount as bigint,
			type: scriptType(o.script as Uint8Array),
		});
	}
	return out;
}

// Ausgang einer gespeicherten Transaktion (für die Prüfung von Eingängen)
export function outputOf(raw: string, vout: number): Prevout | null {
	const tx = Transaction.fromRaw(hex.decode(raw), {
		allowUnknownOutputs: true,
	});
	if (vout < 0 || vout >= tx.outputsLength) return null;
	const o = tx.getOutput(vout);
	return o.script && o.amount !== undefined
		? { script: o.script as Uint8Array, sats: o.amount as bigint }
		: null;
}

// Dust-Grenze je Skripttyp bei 3 sat/vB (Bitcoin Core, dustrelayfee)
export function dustLimit(type: string): bigint {
	if (type === "wpkh") return 294n;
	if (type === "tr" || type === "wsh") return 330n;
	return 546n;
}

export type SpendCheck =
	| {
			ok: true;
			txid: string;
			wtxid: string;
			fee: bigint;
			vsize: number;
			inputs: { txid: string; vout: number }[];
			outputs: DecodedOutput[];
	  }
	| { ok: false; reason: string };

export function checkSpend(
	raw: string,
	prevout: (txid: string, vout: number) => Prevout | null,
): SpendCheck {
	let tx: Transaction;
	try {
		tx = Transaction.fromRaw(hex.decode(raw), {
			allowUnknownOutputs: true,
			disableScriptCheck: true,
		});
	} catch {
		return { ok: false, reason: "TX decode failed" };
	}
	if (tx.inputsLength === 0 || tx.outputsLength === 0)
		return { ok: false, reason: "bad-txns-vin-empty" };
	let sumIn = 0n;
	const inputs: { txid: string; vout: number }[] = [];
	const seen = new Set<string>();
	for (let i = 0; i < tx.inputsLength; i += 1) {
		const input = tx.getInput(i);
		const txid = hex.encode(input.txid as Uint8Array);
		const vout = input.index as number;
		if (seen.has(`${txid}:${vout}`))
			return { ok: false, reason: "bad-txns-inputs-duplicate" };
		seen.add(`${txid}:${vout}`);
		const prev = prevout(txid, vout);
		if (!prev) return { ok: false, reason: "bad-txns-inputs-missingorspent" };
		const wit = input.finalScriptWitness;
		if (!wit || wit.length !== 2)
			return { ok: false, reason: "non-mandatory-script-verify-flag" };
		const [sig, pub] = wit as [Uint8Array, Uint8Array];
		const decoded = OutScript.decode(prev.script);
		if (
			decoded.type !== "wpkh" ||
			hex.encode(decoded.hash) !== hex.encode(hash160(pub))
		)
			return { ok: false, reason: "mandatory-script-verify-flag-failed" };
		if (sig[sig.length - 1] !== SigHash.ALL)
			return { ok: false, reason: "sighash-not-all" };
		const scriptCode = OutScript.encode({ type: "pkh", hash: decoded.hash });
		const msg = tx.preimageWitnessV0(i, scriptCode, SigHash.ALL, prev.sats);
		const valid = secp256k1.verify(sig.slice(0, -1), msg, pub, {
			prehash: false,
			format: "der",
		});
		if (!valid)
			return { ok: false, reason: "mandatory-script-verify-flag-failed" };
		sumIn += prev.sats;
		inputs.push({ txid, vout });
	}
	const outputs = decodeOutputs(raw);
	const sumOut = outputs.reduce((s, o) => s + o.sats, 0n);
	if (sumOut > sumIn) return { ok: false, reason: "bad-txns-in-belowout" };
	return {
		ok: true,
		txid: tx.id,
		wtxid: hex.encode(sha256(sha256(tx.toBytes(true, true))).reverse()),
		fee: sumIn - sumOut,
		vsize: tx.vsize,
		inputs,
		outputs,
	};
}
