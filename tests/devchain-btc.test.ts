import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { p2wpkh, RawTx, TEST_NETWORK } from "@scure/btc-signer";
import { beforeEach, describe, expect, it } from "vitest";
import {
	type BtcSpendRequest,
	buildBtcSpend,
} from "@/lib/wallet/core/btc-spend";
import { btcChain, serializeBtc } from "@/scripts/devchain/btc";
import {
	checkSpend,
	decodeOutputs,
	dustLimit,
	fundingRaw,
	outputOf,
} from "@/scripts/devchain/btc-tx";
import { Forbidden, initialState, RpcFault } from "@/scripts/devchain/state";

// Bitcoin-Core-Nachbau der Testkette: Senden wie ein Knoten (Signaturen,
// Doppelausgabe, Mindestgebühr, Dust, Höchstgebühr, RBF), Wallet-Sicht mit
// Ausgängen und Gebühr, Salden aus der UTXO-Menge, Reorg.

const TPRV = { private: 0x04358394, public: 0x043587cf };
const account = (label: string) =>
	HDKey.fromMasterSeed(sha256(new TextEncoder().encode(label)), TPRV).derive(
		"m/84'/1'/0'",
	);
const mine = account("klick-devchain-btc");
const other = account("klick-devchain-other");
const keyAt = (branch: 0 | 1, index: number) => {
	const k = mine.deriveChild(branch).deriveChild(index);
	return { priv: k.privateKey as Uint8Array, pub: k.publicKey as Uint8Array };
};
const addrOf = (acc: HDKey, branch: 0 | 1, index: number) =>
	p2wpkh(
		acc.deriveChild(branch).deriveChild(index).publicKey as Uint8Array,
		TEST_NETWORK,
	).address as string;
const TPUB = mine.publicExtendedKey;
const DEST = addrOf(other, 0, 0);
const WALLET = "klick-test";

let chain: ReturnType<typeof btcChain>;
// Antworten wie über HTTP (Beträge als JSON-Zahl → hier als Zahl)
const rpc = (method: string, params: unknown[] = [], wallet?: string) =>
	JSON.parse(serializeBtc(chain.call(method, params, wallet ?? null)));

function fault(fn: () => unknown): RpcFault {
	try {
		fn();
	} catch (e) {
		if (e instanceof RpcFault) return e;
		throw e;
	}
	throw new Error("kein Fehler");
}

beforeEach(() => {
	chain = btcChain(initialState());
	rpc("createwallet", [WALLET]);
	rpc(
		"importdescriptors",
		[
			[
				{ desc: `wpkh(${TPUB}/0/*)`, range: [0, 20] },
				{ desc: `wpkh(${TPUB}/1/*)`, range: [0, 20] },
			],
		],
		WALLET,
	);
});

// Faucet an Adresse 0/i, einen Block minen; liefert txid und Roh-Hex
function fund(sats: bigint, index = 0) {
	const txid = chain.faucet(addrOf(mine, 0, index), sats);
	chain.mine(1);
	const tx = rpc("gettransaction", [txid, true], WALLET);
	return { txid, hex: tx.hex as string };
}

function spend(
	funding: { txid: string; hex: string },
	over: Partial<BtcSpendRequest> = {},
	index = 0,
) {
	return buildBtcSpend(
		{
			network: "bitcoin_signet",
			destination: DEST,
			amount: 30_000n,
			inputs: [
				{
					txid: funding.txid,
					vout: 0,
					prevTxHex: funding.hex,
					branch: 0,
					index,
				},
			],
			changeIndex: 0,
			fee: 1_000n,
			feeCap: 50_000_000n,
			maxSatPerVb: 100_000,
			...over,
		},
		keyAt,
	);
}

describe("btc-tx (rein)", () => {
	it("Faucet-Zahlung ist eine echte Transaktion mit genau einem Ausgang", () => {
		const { raw, txid } = fundingRaw(DEST, 12_345n, new Uint8Array([1, 2]));
		expect(txid).toMatch(/^[0-9a-f]{64}$/);
		expect(decodeOutputs(raw)).toEqual([
			{ address: DEST, sats: 12_345n, type: "wpkh" },
		]);
		expect(outputOf(raw, 0)?.sats).toBe(12_345n);
		expect(outputOf(raw, 1)).toBeNull();
	});

	it("Dust-Grenzen je Skripttyp", () => {
		expect(dustLimit("wpkh")).toBe(294n);
		expect(dustLimit("tr")).toBe(330n);
		expect(dustLimit("pkh")).toBe(546n);
	});

	it("prüft Signatur, Eingänge und Summen", () => {
		const f = fund(100_000n);
		const s = spend(f);
		const prev = (txid: string, vout: number) =>
			txid === f.txid ? outputOf(f.hex, vout) : null;
		const ok = checkSpend(s.raw, prev);
		expect(ok.ok && ok.fee).toBe(1_000n);
		expect(ok.ok && ok.txid).toBe(s.txid);
		expect(checkSpend("zz", prev)).toEqual({
			ok: false,
			reason: "TX decode failed",
		});
		expect(checkSpend(s.raw, () => null)).toEqual({
			ok: false,
			reason: "bad-txns-inputs-missingorspent",
		});
		// Betrag nachträglich geändert → Signatur passt nicht mehr
		const decoded = RawTx.decode(hex.decode(s.raw));
		(decoded.outputs[0] as { amount: bigint }).amount -= 1n;
		expect(checkSpend(hex.encode(RawTx.encode(decoded)), prev)).toEqual({
			ok: false,
			reason: "mandatory-script-verify-flag-failed",
		});
	});
});

describe("Testkette Bitcoin: Senden", () => {
	it("listunspent, gettransaction mit hex, estimatesmartfee", () => {
		const f = fund(100_000n);
		const utxos = rpc("listunspent", [1, 9_999_999, [], true], WALLET);
		expect(utxos).toEqual([
			expect.objectContaining({
				txid: f.txid,
				vout: 0,
				amount: 0.001,
				confirmations: 1,
				address: addrOf(mine, 0, 0),
			}),
		]);
		expect(rpc("listunspent", [2], WALLET)).toEqual([]);
		expect(rpc("estimatesmartfee", [2])).toEqual({
			feerate: 0.00002,
			blocks: 2,
		});
	});

	it("sendet: Mempool, Wallet-Sicht mit Gebühr, Wechselgeld, Block", () => {
		const f = fund(100_000n);
		const s = spend(f);
		expect(rpc("testmempoolaccept", [[s.raw]])).toEqual([
			expect.objectContaining({
				txid: s.txid,
				allowed: true,
				fees: { base: 0.00001 },
			}),
		]);
		expect(rpc("sendrawtransaction", [s.raw])).toBe(s.txid);
		// erneut senden: bekannt, kein Fehler
		expect(rpc("sendrawtransaction", [s.raw])).toBe(s.txid);
		expect(rpc("testmempoolaccept", [[s.raw]])[0]["reject-reason"]).toBe(
			"txn-already-in-mempool",
		);

		const since = rpc("listsinceblock", ["", 1, true, true], WALLET);
		const sends = since.transactions.filter(
			(t: { category: string }) => t.category === "send",
		);
		// Wechselgeld (eigene Adresse 1/0) taucht wie bei Bitcoin Core nicht auf
		expect(sends).toEqual([
			expect.objectContaining({
				address: DEST,
				amount: -0.0003,
				fee: -0.00001,
				confirmations: 0,
			}),
		]);
		// unbestätigtes Wechselgeld aus eigener Transaktion zählt als sicher
		expect(rpc("getbalances", [], WALLET).mine).toEqual({
			trusted: 0.00069,
			untrusted_pending: 0,
			immature: 0,
		});
		const tx = rpc("gettransaction", [s.txid, true], WALLET);
		expect(tx).toMatchObject({ amount: -0.0003, fee: -0.00001, hex: s.raw });

		chain.mine(1);
		const after = rpc("listunspent", [1], WALLET);
		expect(after).toEqual([
			expect.objectContaining({
				txid: s.txid,
				vout: 1,
				amount: 0.00069,
				address: addrOf(mine, 1, 0),
			}),
		]);
		// im Block: erneut senden → bereits in der UTXO-Menge
		expect(fault(() => rpc("sendrawtransaction", [s.raw])).code).toBe(-27);
	});

	it("Doppelausgabe: gleiche Gebühr abgelehnt, höhere ersetzt (RBF)", () => {
		const f = fund(100_000n);
		const first = spend(f);
		rpc("sendrawtransaction", [first.raw]);
		const same = spend(f, { amount: 31_000n });
		expect(fault(() => rpc("sendrawtransaction", [same.raw])).message).toMatch(
			/insufficient fee, rejecting replacement/,
		);
		// höherer Satz, aber nicht genug zusätzliche Gebühr für die Weiterleitung
		const tiny = spend(f, { fee: 1_050n });
		expect(fault(() => rpc("sendrawtransaction", [tiny.raw])).message).toMatch(
			/not enough additional fees/,
		);
		const bump = spend(f, { fee: 2_000n });
		expect(rpc("sendrawtransaction", [bump.raw])).toBe(bump.txid);
		const old = rpc("gettransaction", [first.txid, true], WALLET);
		expect(old.replaced_by_txid).toBe(bump.txid);
		expect(old.confirmations).toBe(0);
		chain.mine(1);
		expect(
			rpc("gettransaction", [first.txid, true], WALLET).confirmations,
		).toBe(-1);
		expect(rpc("gettransaction", [bump.txid, true], WALLET).confirmations).toBe(
			1,
		);
		// ausgegeben in einem Block: weitere Doppelausgabe scheitert
		const late = spend(f, { fee: 5_000n });
		expect(fault(() => rpc("sendrawtransaction", [late.raw])).code).toBe(-25);
	});

	it("lehnt Dust, Mindestgebühr und zu hohe Gebühr ab", () => {
		const f = fund(10_000_000n);
		const dust = spend(f, { amount: 200n });
		expect(fault(() => rpc("sendrawtransaction", [dust.raw])).message).toBe(
			"dust",
		);
		const cheap = spend(f, { fee: 50n });
		expect(fault(() => rpc("sendrawtransaction", [cheap.raw])).message).toBe(
			"min relay fee not met",
		);
		const greedy = spend(f, { fee: 2_000_000n });
		expect(
			fault(() => rpc("sendrawtransaction", [greedy.raw])).message,
		).toMatch(/Fee exceeds maximum/);
		// ausdrücklich höheres Limit (BTC/kvB) lässt sie durch
		expect(rpc("sendrawtransaction", [greedy.raw, 0])).toBe(greedy.txid);
	});

	it("Reorg mit Doppelausgabe verwirft abhängige Mempool-Transaktionen", () => {
		const f = fund(100_000n);
		const s = spend(f);
		rpc("sendrawtransaction", [s.raw]);
		chain.reorg(1, true);
		expect(rpc("gettransaction", [f.txid, true], WALLET).confirmations).toBe(
			-1,
		);
		expect(rpc("gettransaction", [s.txid, true], WALLET).confirmations).toBe(
			-1,
		);
		expect(rpc("listunspent", [0], WALLET)).toEqual([]);
	});

	it("Reorg ohne Konflikt: Transaktionen zurück in den Mempool", () => {
		const f = fund(100_000n);
		chain.reorg(1, false);
		// neue Blöcke enthalten sie wieder
		expect(rpc("gettransaction", [f.txid, true], WALLET).confirmations).toBe(2);
	});

	it("Fehler wie Bitcoin Core: ohne Wallet, unbekannte Methode", () => {
		expect(fault(() => rpc("listunspent", [1])).code).toBe(-18);
		expect(
			fault(() => rpc("gettransaction", ["00".repeat(32)], WALLET)).code,
		).toBe(-5);
		expect(() => chain.call("stop", [], null)).toThrow(Forbidden);
	});
});
