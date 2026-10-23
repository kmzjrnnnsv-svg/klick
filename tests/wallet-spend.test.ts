import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import {
	OutScript,
	p2wpkh,
	RawTx,
	SigHash,
	TEST_NETWORK,
	Transaction,
} from "@scure/btc-signer";
import { addr, Transaction as EthTx } from "micro-eth-signer";
import { describe, expect, it } from "vitest";
import { ASSETS } from "@/lib/wallet/core/assets";
import {
	type BtcSpendRequest,
	buildBtcSpend,
	RBF_SEQUENCE,
} from "@/lib/wallet/core/btc-spend";
import {
	DUST_P2WPKH,
	estimateVsize,
	selectCoins,
} from "@/lib/wallet/core/coin-select";
import { buildEthSpend, transferCalldata } from "@/lib/wallet/core/eth-spend";
import {
	encodeIntent,
	type Intent,
	IntentError,
	intentChallenge,
	parseIntent,
} from "@/lib/wallet/core/intent";
import {
	approvalsSatisfied,
	isTightening,
	type Policy,
	policyHash,
	policyIssues,
	spendAllowed,
} from "@/lib/wallet/core/policy";
import vectors from "./fixtures/wallet-intent-vectors.json";

const SEED = sha256(new TextEncoder().encode("klick-test-seed"));
const TPRV = { private: 0x04358394, public: 0x043587cf };
const btcAccount = HDKey.fromMasterSeed(SEED, TPRV).derive("m/84'/1'/0'");
const keyAt = (branch: 0 | 1, index: number) => {
	const k = btcAccount.deriveChild(branch).deriveChild(index);
	return { priv: k.privateKey as Uint8Array, pub: k.publicKey as Uint8Array };
};
const addrAt = (branch: 0 | 1, index: number) =>
	p2wpkh(keyAt(branch, index).pub, TEST_NETWORK).address as string;

// Vorgänger-Transaktion mit einem Ausgang an `script`
function fundingTx(script: Uint8Array, amount: bigint, salt: number) {
	const raw = RawTx.encode({
		version: 2,
		segwitFlag: false,
		inputs: [
			{
				txid: sha256(new Uint8Array([salt])),
				index: 0,
				finalScriptSig: new Uint8Array(),
				sequence: 0xffffffff,
			},
		],
		outputs: [{ script, amount }],
		witnesses: [],
		lockTime: 0,
	});
	return { hex: hex.encode(raw), txid: Transaction.fromRaw(raw).id };
}

const DEST = addrAt(0, 7); // eigene Zieladresse genügt für den Test
const own = (i: number, amount: bigint) =>
	fundingTx(p2wpkh(keyAt(0, i).pub, TEST_NETWORK).script, amount, i);

function baseReq(over: Partial<BtcSpendRequest> = {}): BtcSpendRequest {
	const f = own(1, 100_000n);
	return {
		network: "bitcoin_signet",
		destination: DEST,
		amount: 60_000n,
		inputs: [{ txid: f.txid, vout: 0, prevTxHex: f.hex, branch: 0, index: 1 }],
		changeIndex: 3,
		fee: 1_000n,
		feeCap: 5_000n,
		maxSatPerVb: 50,
		...over,
	};
}

describe("buildBtcSpend", () => {
	it("baut Ziel + Wechselgeld, RBF, gültige Signatur", () => {
		const s = buildBtcSpend(baseReq(), keyAt);
		const tx = Transaction.fromRaw(hex.decode(s.raw));
		expect(tx.outputsLength).toBe(2);
		expect(tx.getOutput(0).amount).toBe(60_000n);
		expect(tx.getOutput(1).amount).toBe(39_000n);
		expect(s.change).toBe(39_000n);
		expect(tx.getInput(0).sequence).toBe(RBF_SEQUENCE);
		// Wechselgeld geht an Zweig 1, Index 3
		expect(hex.encode(tx.getOutput(1).script as Uint8Array)).toBe(
			hex.encode(p2wpkh(keyAt(1, 3).pub, TEST_NETWORK).script),
		);
		// Signatur gegen BIP-143-Preimage prüfen
		const wit = tx.getInput(0).finalScriptWitness as Uint8Array[];
		const sig = wit[0] as Uint8Array;
		const pub = wit[1] as Uint8Array;
		expect(sig[sig.length - 1]).toBe(SigHash.ALL);
		const scriptCode = OutScript.encode({
			type: "pkh",
			hash: p2wpkh(pub, TEST_NETWORK).hash as Uint8Array,
		});
		const msg = tx.preimageWitnessV0(0, scriptCode, SigHash.ALL, 100_000n);
		expect(
			secp256k1.verify(sig.slice(0, -1), msg, pub, {
				prehash: false,
				format: "der",
			}),
		).toBe(true);
	});

	it("lehnt eine gelogene Vorgänger-Transaktion ab (Gebührenlüge)", () => {
		const real = own(1, 100_000n);
		const fake = own(2, 100_000_000n);
		expect(() =>
			buildBtcSpend(
				baseReq({
					inputs: [
						{
							txid: real.txid,
							vout: 0,
							prevTxHex: fake.hex,
							branch: 0,
							index: 1,
						},
					],
				}),
				keyAt,
			),
		).toThrow("prev_tx");
	});

	it("lehnt fremde Eingänge ab", () => {
		const other = HDKey.fromMasterSeed(new Uint8Array(32).fill(9), TPRV);
		const f = fundingTx(
			p2wpkh(
				other.derive("m/84'/1'/0'/0/1").publicKey as Uint8Array,
				TEST_NETWORK,
			).script,
			100_000n,
			5,
		);
		expect(() =>
			buildBtcSpend(
				baseReq({
					inputs: [
						{ txid: f.txid, vout: 0, prevTxHex: f.hex, branch: 0, index: 1 },
					],
				}),
				keyAt,
			),
		).toThrow("foreign_input");
	});

	it("hält Gebühren-Deckel und Gebührensatz ein", () => {
		expect(() => buildBtcSpend(baseReq({ fee: 6_000n }), keyAt)).toThrow(
			"fee_cap",
		);
		expect(() =>
			buildBtcSpend(baseReq({ fee: 5_000n, maxSatPerVb: 2 }), keyAt),
		).toThrow("fee_rate");
	});

	it("Dust-Wechselgeld, fehlender Index, falsches Netz, doppelte Eingänge", () => {
		expect(() =>
			buildBtcSpend(baseReq({ amount: 100_000n - 1_000n - 100n }), keyAt),
		).toThrow("dust_change");
		expect(() => buildBtcSpend(baseReq({ changeIndex: null }), keyAt)).toThrow(
			"change_index",
		);
		expect(() =>
			buildBtcSpend(
				baseReq({ destination: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" }),
				keyAt,
			),
		).toThrow("destination");
		const r = baseReq();
		expect(() =>
			buildBtcSpend({ ...r, inputs: [...r.inputs, ...r.inputs] }, keyAt),
		).toThrow("duplicate_input");
	});

	it("ohne Wechselgeld genau ein Ausgang", () => {
		const s = buildBtcSpend(
			baseReq({ amount: 99_000n, changeIndex: null }),
			keyAt,
		);
		expect(Transaction.fromRaw(hex.decode(s.raw)).outputsLength).toBe(1);
		expect(s.change).toBe(0n);
	});
});

describe("selectCoins", () => {
	const u = (value: bigint, index: number) => ({
		txid: "a".repeat(64),
		vout: index,
		value,
		branch: 0 as const,
		index,
	});
	it("größte zuerst, Gebühr aus vsize", () => {
		const r = selectCoins([u(10_000n, 0), u(80_000n, 1)], 50_000n, 2);
		expect("inputs" in r && r.inputs.map((x) => x.value)).toEqual([80_000n]);
		expect("fee" in r && r.fee).toBe(BigInt(estimateVsize(1, 2) * 2));
	});
	it("Dust-Wechselgeld geht in die Gebühr", () => {
		const r = selectCoins([u(50_400n, 0)], 50_000n, 1);
		expect("change" in r && r.change).toBe(0n);
		expect("fee" in r && r.fee).toBe(400n);
		expect(DUST_P2WPKH).toBe(294n);
	});
	it("zu wenig Guthaben", () => {
		expect(selectCoins([u(1_000n, 0)], 50_000n, 1)).toEqual({
			error: "insufficient",
		});
	});
});

const ethKey = HDKey.fromMasterSeed(SEED).derive("m/44'/60'/0'/0/0");
const ethPriv = ethKey.privateKey as Uint8Array;
const ethFrom = addr.fromPublicKey(ethKey.publicKey as Uint8Array);
const ETH_DEST = addr.addChecksum("0x00000000000000000000000000000000000000aa");

describe("buildEthSpend", () => {
	const base = {
		network: "ethereum_sepolia" as const,
		destination: ETH_DEST,
		nonce: 4n,
		gasLimit: 21_000n,
		maxFeePerGas: 2_000_000_000n,
		maxPriorityFeePerGas: 1_000_000_000n,
		feeCap: 10n ** 15n,
		maxFeePerGasCap: 100_000_000_000n,
	};
	it("ETH: Typ 2, Sepolia, Ziel + Wert, keine Daten, Absender stimmt", () => {
		const s = buildEthSpend(
			{ ...base, asset: "ETH", amount: 10n ** 16n },
			ethPriv,
		);
		const tx = EthTx.fromHex(s.raw);
		expect(tx.type).toBe("eip1559");
		expect(tx.raw.chainId).toBe(11155111n);
		expect(addr.addChecksum(tx.raw.to)).toBe(ETH_DEST);
		expect(tx.raw.value).toBe(10n ** 16n);
		expect(tx.raw.data).toBe("0x");
		expect(s.from).toBe(ethFrom);
	});
	it("Token: gepinnter Vertrag, Wert 0, Daten exakt transfer()", () => {
		const usdc = ASSETS.ethereum_sepolia.find((a) => a.code === "USDC");
		const s = buildEthSpend(
			{ ...base, gasLimit: 65_000n, asset: "USDC", amount: 1_500_000n },
			ethPriv,
		);
		const tx = EthTx.fromHex(s.raw);
		expect(addr.addChecksum(tx.raw.to)).toBe(usdc?.contract);
		expect(tx.raw.value).toBe(0n);
		expect(tx.raw.data).toBe(transferCalldata(ETH_DEST, 1_500_000n));
	});
	it("Deckel und Netz", () => {
		expect(() =>
			buildEthSpend(
				{ ...base, asset: "ETH", amount: 1n, feeCap: 1000n },
				ethPriv,
			),
		).toThrow("fee_cap");
		expect(() =>
			buildEthSpend(
				{ ...base, asset: "ETH", amount: 1n, maxFeePerGas: 200_000_000_000n },
				ethPriv,
			),
		).toThrow("fee_rate");
		expect(() =>
			buildEthSpend(
				{ ...base, network: "bitcoin_signet", asset: "ETH", amount: 1n },
				ethPriv,
			),
		).toThrow("network");
		expect(() =>
			buildEthSpend(
				{
					...base,
					asset: "ETH",
					amount: 1n,
					// nicht kanonisch (ohne EIP-55-Prüfsumme)
					destination: ETH_DEST.toLowerCase(),
				},
				ethPriv,
			),
		).toThrow("destination");
	});
});

const UUID = "11111111-2222-4333-8444-555555555555";
const payout: Intent = {
	kind: "payout",
	orgId: UUID,
	accountId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
	network: "bitcoin_signet",
	chainId: null,
	asset: "BTC",
	amount: 60_000n,
	destination: DEST,
	destinationActiveSince: 1_792_000_000,
	feeCap: 5_000n,
	initiator: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
	intentId: "0123456789abcdef0123456789abcdef",
	nonce: "fedcba9876543210fedcba9876543210",
	expiresAt: 1_792_100_000,
};

describe("Absicht (kanonischer Text)", () => {
	it("Rundreise Auszahlung und Zieladresse", () => {
		const text = encodeIntent(payout);
		expect(parseIntent(text)).toEqual(payout);
		const wl: Intent = {
			...payout,
			kind: "whitelist",
			accountId: null,
			asset: null,
			amount: null,
			feeCap: null,
			destinationActiveSince: null,
		};
		expect(parseIntent(encodeIntent(wl))).toEqual(wl);
	});
	it("lehnt Trenner, Umbrüche und zweite Schreibweisen ab", () => {
		const text = encodeIntent(payout);
		expect(() => parseIntent(text.replace(DEST, `${DEST}|x`))).toThrow(
			IntentError,
		);
		expect(() => parseIntent(`${text}\n`)).toThrow(IntentError);
		expect(() => parseIntent(text.replace(DEST, DEST.toUpperCase()))).toThrow(
			IntentError,
		);
		expect(() => parseIntent(text.replace("|60000|", "|060000|"))).toThrow(
			IntentError,
		);
		expect(() =>
			encodeIntent({ ...payout, network: "ethereum_sepolia" }),
		).toThrow(IntentError);
		expect(() => encodeIntent({ ...payout, amount: 0n })).toThrow(IntentError);
	});
	it("Testvektoren (gemeinsam mit der Bestätigungsseite)", () => {
		for (const v of vectors) {
			expect(encodeIntent(parseIntent(v.text))).toBe(v.text);
			expect(bytesToHex(intentChallenge(v.text))).toBe(v.challenge);
		}
	});
});

const policy: Policy = {
	version: 1,
	prev: null,
	mode: "solo",
	soloMinKeys: 2,
	soloDelaySec: 1800,
	whitelistCooldownSec: 86_400,
	approvalWindowSec: 3600,
	limits: { BTC: { perPayout: "1000000", perDay: "3000000" } },
	feeCaps: { btcSatPerVb: 50, ethMaxFeeGwei: 100 },
	networks: ["bitcoin_signet", "ethereum_sepolia"],
	liveFunds: false,
};

describe("Richtlinie", () => {
	it("Grenzen in Prod und Dev", () => {
		expect(policyIssues(policy, { dev: false })).toEqual([]);
		expect(
			policyIssues(
				{ ...policy, soloMinKeys: 1, whitelistCooldownSec: 0 },
				{
					dev: false,
				},
			),
		).toEqual(["solo_keys", "cooldown"]);
		expect(
			policyIssues(
				{ ...policy, soloMinKeys: 1, whitelistCooldownSec: 0 },
				{
					dev: true,
				},
			),
		).toEqual([]);
		expect(
			policyIssues(
				{ ...policy, networks: ["bitcoin_mainnet"] },
				{ dev: false },
			),
		).toContain("live");
	});
	it("Verschärfen vs. Lockern", () => {
		expect(isTightening(policy, { ...policy, mode: "four_eyes" })).toBe(true);
		expect(
			isTightening(
				{ ...policy, mode: "four_eyes" },
				{ ...policy, mode: "solo" },
			),
		).toBe(false);
		expect(
			isTightening(policy, {
				...policy,
				limits: { BTC: { perPayout: "500000", perDay: "3000000" } },
			}),
		).toBe(true);
		expect(
			isTightening(policy, {
				...policy,
				limits: {
					...policy.limits,
					ETH: { perPayout: "1", perDay: "1" },
				},
			}),
		).toBe(false);
		expect(
			isTightening(policy, { ...policy, whitelistCooldownSec: 3600 }),
		).toBe(false);
	});
	it("Grenze je Auszahlung und Tag", () => {
		expect(spendAllowed(policy, "BTC", 1_000_000n, 0n)).toBe("ok");
		expect(spendAllowed(policy, "BTC", 1_000_001n, 0n)).toBe("per_payout");
		expect(spendAllowed(policy, "BTC", 900_000n, 2_200_000n)).toBe("per_day");
		expect(spendAllowed(policy, "ETH", 1n, 0n)).toBe("asset_not_allowed");
	});
	it("Freigabe: Solo braucht zwei Schlüssel, Vier-Augen zwei Personen", () => {
		const a = { personId: "p1", credentialId: "c1" };
		expect(approvalsSatisfied(policy, [a], new Map([["p1", 1]]))).toBe(false);
		expect(approvalsSatisfied(policy, [a], new Map([["p1", 2]]))).toBe(true);
		const four = { ...policy, mode: "four_eyes" as const };
		expect(
			approvalsSatisfied(
				four,
				[a, { personId: "p1", credentialId: "c2" }],
				new Map(),
			),
		).toBe(false);
		expect(
			approvalsSatisfied(
				four,
				[a, { personId: "p2", credentialId: "c3" }],
				new Map(),
			),
		).toBe(true);
	});
	it("Hash unabhängig von der Schlüsselreihenfolge", () => {
		const reordered = Object.fromEntries(
			Object.entries(policy).reverse(),
		) as Policy;
		expect(policyHash(reordered)).toBe(policyHash(policy));
		expect(policyHash({ ...policy, version: 2 })).not.toBe(policyHash(policy));
	});
});
