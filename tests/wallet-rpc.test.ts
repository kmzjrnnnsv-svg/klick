import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { p2wpkh, TEST_NETWORK } from "@scure/btc-signer";
import { addr } from "micro-eth-signer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetOf } from "@/lib/wallet/core/assets";
import { buildBtcSpend } from "@/lib/wallet/core/btc-spend";
import { buildEthSpend, transferCalldata } from "@/lib/wallet/core/eth-spend";
import { BitcoinRpc, btcToSats } from "@/lib/wallet/rpc/bitcoin";
import { EthereumRpc } from "@/lib/wallet/rpc/ethereum";
import { endpointFrom, RpcError } from "@/lib/wallet/rpc/http";
import { type Devchain, startDevchain } from "@/scripts/devchain/server";

// RPC-Clients fürs Senden gegen die Testkette über echtes HTTP: Beträge
// exakt (nie Float), Fehler der Knoten als RpcError mit Code, rpcwhitelist
// als 403.

const TPRV = { private: 0x04358394, public: 0x043587cf };
const btcAccount = HDKey.fromMasterSeed(
	sha256(new TextEncoder().encode("klick-wallet-rpc")),
	TPRV,
).derive("m/84'/1'/0'");
const keyAt = (branch: 0 | 1, index: number) => {
	const k = btcAccount.deriveChild(branch).deriveChild(index);
	return { priv: k.privateKey as Uint8Array, pub: k.publicKey as Uint8Array };
};
const btcAddr = (branch: 0 | 1, index: number) =>
	p2wpkh(keyAt(branch, index).pub, TEST_NETWORK).address as string;
// fremde Adresse (eigene Adressen zählen als Wechselgeld)
const BTC_DEST = p2wpkh(
	HDKey.fromMasterSeed(sha256(new TextEncoder().encode("fremd")), TPRV).derive(
		"m/84'/1'/0'/0/0",
	).publicKey as Uint8Array,
	TEST_NETWORK,
).address as string;

const ethKey = HDKey.fromMasterSeed(
	sha256(new TextEncoder().encode("klick-wallet-rpc")),
).derive("m/44'/60'/0'/0/0");
const ETH_FROM = addr.fromPublicKey(ethKey.publicKey as Uint8Array);
const ETH_DEST = addr.addChecksum("0x00000000000000000000000000000000000000bb");
const USDC = assetOf("ethereum_sepolia", "USDC")?.contract as string;
const GWEI = 1_000_000_000n;

let dev: Devchain;
let btc: BitcoinRpc;
let eth: EthereumRpc;
const WALLET = "klick-rpc";

const control = async (base: string, path: string, body: unknown) => {
	const res = await fetch(`${base}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return (await res.json()) as Record<string, unknown>;
};

beforeAll(async () => {
	dev = await startDevchain({ btcPort: 0, ethPort: 0, stateFile: null });
	const u = new URL(dev.btcUrl);
	btc = new BitcoinRpc(endpointFrom(`http://dev:dev@${u.host}`));
	eth = new EthereumRpc(endpointFrom(dev.ethUrl));
	await btc.ensureWatchWallet(WALLET);
	const tpub = btcAccount.publicExtendedKey;
	await btc.importDescriptors(WALLET, [
		{ desc: `wpkh(${tpub}/0/*)`, range: [0, 20], timestamp: "now" },
		{ desc: `wpkh(${tpub}/1/*)`, range: [0, 20], timestamp: "now" },
	]);
});

afterAll(async () => {
	await dev.close();
});

describe("BitcoinRpc fürs Senden", () => {
	it("rpcwhitelist: nicht erlaubte Methode → 403", async () => {
		const e = await btc.probe("stop").catch((x) => x);
		expect(e).toBeInstanceOf(RpcError);
		expect((e as RpcError).code).toBe("http");
	});

	it("Gebührenschätzung exakt, ohne Daten null", async () => {
		expect(await btc.estimateSmartFee(2)).toBe("0.00002000");
		await control(dev.btcUrl, "/dev/fee", { satPerVb: 12.5 });
		expect(await btc.estimateSmartFee(2)).toBe("0.00012500");
		await control(dev.btcUrl, "/dev/fee", { satPerVb: null });
		expect(await btc.estimateSmartFee(2)).toBeNull();
		await control(dev.btcUrl, "/dev/fee", { satPerVb: 2 });
	});

	it("UTXOs, Vorgänger-Hex, Prüfen, Senden, Fehlercodes", async () => {
		const { txid } = (await control(dev.btcUrl, "/dev/faucet", {
			address: btcAddr(0, 0),
			amount: "0.00123456",
		})) as { txid: string };
		await control(dev.btcUrl, "/dev/mine", { n: 1 });

		const utxos = await btc.listUnspent(WALLET, 1);
		expect(utxos).toHaveLength(1);
		// exakt als Text, nie über Float gerundet
		expect(utxos[0]?.amount).toBe("0.00123456");
		expect(btcToSats(utxos[0]?.amount as string)).toBe(123_456n);

		const prev = await btc.getTransaction(WALLET, txid);
		const spend = buildBtcSpend(
			{
				network: "bitcoin_signet",
				destination: BTC_DEST,
				amount: 50_000n,
				inputs: [{ txid, vout: 0, prevTxHex: prev.hex, branch: 0, index: 0 }],
				changeIndex: 0,
				fee: 500n,
				feeCap: 10_000n,
				maxSatPerVb: 20,
			},
			keyAt,
		);
		const [accept] = await btc.testMempoolAccept(spend.raw);
		expect(accept).toMatchObject({ txid: spend.txid, allowed: true });
		expect(await btc.sendRawTransaction(spend.raw)).toBe(spend.txid);

		// Doppelausgabe mit gleicher Gebühr: Fehler des Knotens mit Code −26
		const twin = buildBtcSpend(
			{
				network: "bitcoin_signet",
				destination: BTC_DEST,
				amount: 50_001n,
				inputs: [{ txid, vout: 0, prevTxHex: prev.hex, branch: 0, index: 0 }],
				changeIndex: 0,
				fee: 500n,
				feeCap: 10_000n,
				maxSatPerVb: 20,
			},
			keyAt,
		);
		const [refused] = await btc.testMempoolAccept(twin.raw);
		expect(refused?.allowed).toBe(false);
		expect(refused?.["reject-reason"]).toMatch(/insufficient fee/);
		const err = await btc.sendRawTransaction(twin.raw).catch((x) => x);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).rpcCode).toBe(-26);

		await control(dev.btcUrl, "/dev/mine", { n: 1 });
		const after = await btc.listUnspent(WALLET, 1);
		expect(after.map((u) => u.amount)).toEqual(["0.00072956"]);
		const since = await btc.listSinceBlock(WALLET, null, 1);
		expect(
			since.transactions.find(
				(t) => t.category === "send" && t.txid === spend.txid,
			),
		).toMatchObject({ amount: "-0.00050000", fee: "-0.00000500" });
	});
});

describe("EthereumRpc fürs Senden", () => {
	beforeAll(async () => {
		await control(dev.ethUrl, "/dev/faucet", {
			address: ETH_FROM,
			amount: (10n ** 18n).toString(),
		});
		await control(dev.ethUrl, "/dev/faucet", {
			address: ETH_FROM,
			asset: "USDC",
			amount: "2000000",
		});
	});

	it("Nonce, Gebühren, Gas, Code", async () => {
		expect(await eth.transactionCount(ETH_FROM, "latest")).toBe(0n);
		expect(await eth.transactionCount(ETH_FROM, "pending")).toBe(0n);
		await control(dev.ethUrl, "/dev/basefee", { gwei: 2, tipGwei: 0.5 });
		expect(await eth.feeHistory()).toEqual({
			nextBaseFee: 2n * GWEI,
			priorityFee: GWEI / 2n,
		});
		await control(dev.ethUrl, "/dev/basefee", { gwei: 1, tipGwei: 1 });
		expect((await eth.code(USDC)).length).toBeGreaterThan(2);
		expect(await eth.code(ETH_FROM)).toBe("0x");
		const data = transferCalldata(ETH_DEST, 1_000n);
		expect(
			await eth.estimateGas({ from: ETH_FROM, to: USDC, data }),
		).toBeGreaterThan(51_000n);
		// Circle-Sperre: Vorprüfung scheitert mit Revert-Grund
		await control(dev.ethUrl, "/dev/blacklist", { address: ETH_DEST });
		const err = await eth
			.estimateGas({ from: ETH_FROM, to: USDC, data })
			.catch((x) => x);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).message).toMatch(/blacklisted/);
		await control(dev.ethUrl, "/dev/blacklist", {
			address: ETH_DEST,
			on: false,
		});
	});

	it("Senden, pending-Nonce, Block, Fehler „nonce too low“", async () => {
		const s = buildEthSpend(
			{
				network: "ethereum_sepolia",
				asset: "USDC",
				destination: ETH_DEST,
				amount: 1_000n,
				nonce: 0n,
				gasLimit: 80_000n,
				maxFeePerGas: 5n * GWEI,
				maxPriorityFeePerGas: GWEI,
				feeCap: 10n ** 16n,
				maxFeePerGasCap: 100n * GWEI,
			},
			ethKey.privateKey as Uint8Array,
		);
		expect(await eth.sendRawTransaction(s.raw)).toBe(s.hash);
		expect(await eth.transactionCount(ETH_FROM, "pending")).toBe(1n);
		await control(dev.ethUrl, "/dev/mine", { n: 1 });
		expect((await eth.receipt(s.hash))?.status).toBe("0x1");
		expect(await eth.tokenBalance(USDC, ETH_DEST, "latest")).toBe(1_000n);
		const err = await eth.sendRawTransaction(s.raw).catch((x) => x);
		expect(err).toBeInstanceOf(RpcError);
		expect((err as RpcError).message).toMatch(/nonce too low/);
	});
});
