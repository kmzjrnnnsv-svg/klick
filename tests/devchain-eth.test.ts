import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { addr } from "micro-eth-signer";
import { beforeEach, describe, expect, it } from "vitest";
import { assetOf } from "@/lib/wallet/core/assets";
import {
	buildEthSpend,
	type EthSpendRequest,
	transferCalldata,
} from "@/lib/wallet/core/eth-spend";
import { ethChain, intrinsicGas } from "@/scripts/devchain/eth";
import { decodeEthTx, decodeTransfer } from "@/scripts/devchain/eth-tx";
import { initialState, RpcFault } from "@/scripts/devchain/state";

// Reth-Nachbau der Testkette: Senden wie ein Knoten — Signatur und chainId,
// Nonces (latest/pending), Ersetzen nur mit +10 %, Gas, Guthaben,
// Zurückrollen (Circle-Sperrliste, zu wenig Gas), Quittungen und Logs.

const GWEI = 1_000_000_000n;
const ETHER = 10n ** 18n;
const key = HDKey.fromMasterSeed(
	sha256(new TextEncoder().encode("klick-devchain-eth")),
).derive("m/44'/60'/0'/0/0");
const PRIV = key.privateKey as Uint8Array;
const FROM = addr.fromPublicKey(key.publicKey as Uint8Array);
const from = FROM.toLowerCase();
const DEST = addr.addChecksum("0x00000000000000000000000000000000000000aa");
const USDC = assetOf("ethereum_sepolia", "USDC")?.contract as string;

let current = initialState();
let chain: ReturnType<typeof ethChain>;
const rpc = (method: string, params: unknown[] = []) =>
	chain.call(method, params) as never;

function fault(fn: () => unknown): RpcFault {
	try {
		fn();
	} catch (e) {
		if (e instanceof RpcFault) return e;
		throw e;
	}
	throw new Error("kein Fehler");
}

function tx(over: Partial<EthSpendRequest> = {}) {
	return buildEthSpend(
		{
			network: "ethereum_sepolia",
			asset: "ETH",
			destination: DEST,
			amount: ETHER / 10n,
			nonce: 0n,
			gasLimit: 21_000n,
			maxFeePerGas: 3n * GWEI,
			maxPriorityFeePerGas: GWEI,
			feeCap: ETHER,
			maxFeePerGasCap: 1_000n * GWEI,
			...over,
		},
		PRIV,
	);
}

const balance = (a: string) =>
	BigInt(rpc("eth_getBalance", [a, "latest"]) as string);
const nonce = (tag: "latest" | "pending") =>
	Number(BigInt(rpc("eth_getTransactionCount", [FROM, tag]) as string));
const usdcOf = (a: string) =>
	BigInt(
		rpc("eth_call", [
			{
				to: USDC,
				data: `0x70a08231${a.toLowerCase().slice(2).padStart(64, "0")}`,
			},
			"latest",
		]) as string,
	);

// Steuerung wie /dev/blacklist bzw. /dev/basefee (über den Zustand)
const blacklist = (a: string) => current.eth.blacklist.push(a.toLowerCase());
const setBaseFee = (wei: bigint) => {
	current.eth.baseFee = wei.toString();
};

beforeEach(() => {
	current = initialState();
	chain = ethChain(current);
	chain.faucet({ address: FROM, amount: ETHER.toString() });
	chain.faucet({ address: FROM, asset: "USDC", amount: "5000000" });
});

describe("eth-tx (rein)", () => {
	it("dekodiert, prüft chainId und gewinnt den Absender zurück", () => {
		const s = tx();
		const d = decodeEthTx(s.raw, 11155111);
		expect(d).toMatchObject({
			hash: s.hash,
			from,
			nonce: 0,
			to: DEST.toLowerCase(),
			value: ETHER / 10n,
			gasLimit: 21_000n,
		});
		expect(decodeEthTx(s.raw, 1)).toEqual({ error: "invalid chain id" });
		expect(decodeEthTx("0xdeadbeef", 11155111)).toEqual({
			error: "rlp: invalid transaction",
		});
	});

	it("erkennt transfer(address,uint256) und berechnet die Grundgebühr", () => {
		const data = transferCalldata(DEST, 1_500_000n);
		expect(decodeTransfer(data)).toEqual({
			to: DEST.toLowerCase(),
			amount: 1_500_000n,
		});
		expect(decodeTransfer("0x095ea7b3")).toBeNull();
		expect(intrinsicGas("")).toBe(21_000n);
		expect(intrinsicGas("0x0001")).toBe(21_000n + 4n + 16n);
	});
});

describe("Testkette Ethereum: Senden", () => {
	it("Gebühren, Code, Nonces vor dem Senden", () => {
		expect(rpc("eth_feeHistory", ["0x3", "latest", [50]])).toMatchObject({
			baseFeePerGas: expect.arrayContaining(["0x3b9aca00"]),
			reward: [["0x3b9aca00"], ["0x3b9aca00"], ["0x3b9aca00"]],
		});
		expect(rpc("eth_maxPriorityFeePerGas")).toBe("0x3b9aca00");
		expect(rpc("eth_getCode", [USDC, "latest"])).not.toBe("0x");
		expect(rpc("eth_getCode", [FROM, "latest"])).toBe("0x");
		expect(nonce("latest")).toBe(0);
		expect(nonce("pending")).toBe(0);
	});

	it("ETH senden: Pool, pending-Nonce, Block, Quittung, Gas abgezogen", () => {
		const s = tx();
		expect(rpc("eth_sendRawTransaction", [s.raw])).toBe(s.hash);
		expect(nonce("pending")).toBe(1);
		expect(nonce("latest")).toBe(0);
		expect(rpc("eth_getTransactionByHash", [s.hash])).toMatchObject({
			blockNumber: null,
			nonce: "0x0",
		});
		expect(rpc("eth_getTransactionReceipt", [s.hash])).toBeNull();
		expect(fault(() => rpc("eth_sendRawTransaction", [s.raw])).message).toBe(
			"already known",
		);

		chain.mine(1);
		const receipt = rpc("eth_getTransactionReceipt", [s.hash]) as {
			status: string;
			gasUsed: string;
			effectiveGasPrice: string;
		};
		expect(receipt).toMatchObject({ status: "0x1", gasUsed: "0x5208" });
		// Basisgebühr 1 gwei + Trinkgeld 1 gwei
		expect(BigInt(receipt.effectiveGasPrice)).toBe(2n * GWEI);
		expect(balance(DEST)).toBe(ETHER / 10n);
		expect(balance(FROM)).toBe(ETHER - ETHER / 10n - 21_000n * 2n * GWEI);
		expect(nonce("latest")).toBe(1);
		// trace_filter sieht die Zahlung
		const traces = rpc("trace_filter", [
			{ fromBlock: "0x0", toBlock: "latest", toAddress: [DEST] },
		]) as { transactionHash: string }[];
		expect(traces.map((t) => t.transactionHash)).toEqual([s.hash]);
		// alte Nonce nicht noch einmal
		const again = tx({ amount: 1n });
		expect(
			fault(() => rpc("eth_sendRawTransaction", [again.raw])).message,
		).toMatch(/^nonce too low/);
	});

	it("USDC senden: estimateGas, Transfer-Log, Saldo", () => {
		const data = transferCalldata(DEST, 1_500_000n);
		const gas = BigInt(
			rpc("eth_estimateGas", [{ from: FROM, to: USDC, data }]) as string,
		);
		expect(gas).toBe(intrinsicGas(data) + 30_000n);
		const s = tx({ asset: "USDC", amount: 1_500_000n, gasLimit: 80_000n });
		rpc("eth_sendRawTransaction", [s.raw]);
		chain.mine(1);
		const receipt = rpc("eth_getTransactionReceipt", [s.hash]) as {
			status: string;
			logs: unknown[];
		};
		expect(receipt.status).toBe("0x1");
		expect(receipt.logs).toHaveLength(1);
		expect(usdcOf(DEST)).toBe(1_500_000n);
		expect(usdcOf(FROM)).toBe(3_500_000n);
		const logs = rpc("eth_getLogs", [
			{
				fromBlock: "0x0",
				toBlock: "latest",
				address: [USDC],
				topics: [
					null,
					null,
					`0x${DEST.slice(2).toLowerCase().padStart(64, "0")}`,
				],
			},
		]) as unknown[];
		expect(logs).toHaveLength(1);
	});

	it("Ersetzen nur mit 10 % mehr; Ersetzte kennt der Knoten nicht mehr", () => {
		const first = tx();
		rpc("eth_sendRawTransaction", [first.raw]);
		const small = tx({ maxPriorityFeePerGas: (GWEI * 105n) / 100n });
		expect(
			fault(() => rpc("eth_sendRawTransaction", [small.raw])).message,
		).toBe("replacement transaction underpriced");
		const bump = tx({
			maxFeePerGas: (3n * GWEI * 11n) / 10n,
			maxPriorityFeePerGas: (GWEI * 11n) / 10n,
		});
		expect(rpc("eth_sendRawTransaction", [bump.raw])).toBe(bump.hash);
		expect(rpc("eth_getTransactionByHash", [first.hash])).toBeNull();
		chain.mine(1);
		expect(
			(rpc("eth_getTransactionReceipt", [bump.hash]) as { status: string })
				.status,
		).toBe("0x1");
		expect(nonce("latest")).toBe(1);
	});

	it("Circle-Sperrliste: estimateGas scheitert, gesendete Transaktion rollt zurück", () => {
		const s = tx({ asset: "USDC", amount: 1_000_000n, gasLimit: 80_000n });
		// Sperre erst nach dem Senden (Knoten nimmt sie an, Block rollt zurück)
		rpc("eth_sendRawTransaction", [s.raw]);
		blacklist(DEST);
		const data = transferCalldata(DEST, 1n);
		const f = fault(() =>
			rpc("eth_estimateGas", [{ from: FROM, to: USDC, data }]),
		);
		expect(f.code).toBe(3);
		expect(f.message).toMatch(/blacklisted/);
		chain.mine(1);
		const receipt = rpc("eth_getTransactionReceipt", [s.hash]) as {
			status: string;
			gasUsed: string;
		};
		expect(receipt.status).toBe("0x0");
		// Gas wird trotzdem bezahlt
		expect(BigInt(receipt.gasUsed)).toBeGreaterThan(21_000n);
		expect(usdcOf(FROM)).toBe(5_000_000n);
	});

	it("zu wenig Gas für den Token-Aufruf: out of gas, Gas verbraucht", () => {
		const data = transferCalldata(DEST, 1n);
		const s = tx({
			asset: "USDC",
			amount: 1n,
			gasLimit: intrinsicGas(data) + 1_000n,
		});
		rpc("eth_sendRawTransaction", [s.raw]);
		chain.mine(1);
		expect(rpc("eth_getTransactionReceipt", [s.hash])).toMatchObject({
			status: "0x0",
			gasUsed: `0x${(intrinsicGas(data) + 1_000n).toString(16)}`,
		});
	});

	it("lehnt falsche Kette, zu wenig Guthaben und zu wenig Gas ab", () => {
		const main = buildEthSpend(
			{
				network: "ethereum_mainnet",
				asset: "ETH",
				destination: DEST,
				amount: 1n,
				nonce: 0n,
				gasLimit: 21_000n,
				maxFeePerGas: 3n * GWEI,
				maxPriorityFeePerGas: GWEI,
				feeCap: ETHER,
				maxFeePerGasCap: 1_000n * GWEI,
			},
			PRIV,
		);
		expect(fault(() => rpc("eth_sendRawTransaction", [main.raw])).message).toBe(
			"invalid chain id",
		);
		const rich = tx({ amount: 10n * ETHER });
		expect(
			fault(() => rpc("eth_sendRawTransaction", [rich.raw])).message,
		).toMatch(/^insufficient funds for gas \* price \+ value/);
		const thin = tx({
			asset: "USDC",
			amount: 1n,
			gasLimit: 21_000n,
		});
		expect(
			fault(() => rpc("eth_sendRawTransaction", [thin.raw])).message,
		).toMatch(/^intrinsic gas too low/);
	});

	it("Höchstgebühr unter der Basisgebühr: bleibt im Pool", () => {
		chain.mine(1);
		setBaseFee(5n * GWEI);
		const s = tx();
		rpc("eth_sendRawTransaction", [s.raw]);
		chain.mine(2);
		expect(rpc("eth_getTransactionReceipt", [s.hash])).toBeNull();
		setBaseFee(GWEI);
		chain.mine(1);
		expect(
			(rpc("eth_getTransactionReceipt", [s.hash]) as { status: string }).status,
		).toBe("0x1");
	});
});
