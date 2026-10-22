import { type RpcEndpoint, type RpcOptions, rpcBatch, rpcCall } from "./http";

// Ethereum-Knoten (Reth mit `trace`-API) über JSON-RPC. ETH-Eingänge kommen
// aus `trace_filter` (auch Zahlungen aus Verträgen, nicht nur direkte
// Überweisungen), Token-Eingänge aus Transfer-Logs der fest hinterlegten
// Verträge. Alle Zahlen als Hex → BigInt, nie Float.

export type Hex = `0x${string}`;

export type EthBlock = {
	number: Hex;
	hash: Hex;
	parentHash: Hex;
	timestamp: Hex;
};

export type EthLog = {
	address: Hex;
	topics: Hex[];
	data: Hex;
	blockNumber: Hex;
	blockHash: Hex;
	transactionHash: Hex;
	logIndex: Hex;
	removed?: boolean;
};

export type EthTrace = {
	type: "call" | "create" | "suicide" | "reward";
	action: {
		from?: Hex;
		to?: Hex;
		value?: Hex;
		callType?: string;
		address?: Hex;
		refundAddress?: Hex;
		balance?: Hex;
	};
	blockNumber: number;
	blockHash: Hex;
	transactionHash?: Hex;
	traceAddress: number[];
	error?: string;
};

export type EthReceipt = {
	status: Hex;
	from: Hex;
	gasUsed: Hex;
	effectiveGasPrice: Hex;
	blockNumber: Hex;
	blockHash: Hex;
};

// keccak256("Transfer(address,address,uint256)")
export const TRANSFER_TOPIC: Hex =
	"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const toHex = (n: number | bigint): Hex => `0x${n.toString(16)}`;
export const hexToBigInt = (h: string): bigint => (h === "0x" ? 0n : BigInt(h));
export const hexToNumber = (h: string): number => Number(hexToBigInt(h));

// Adresse als 32-Byte-Topic (für Log-Filter)
export const addressTopic = (address: string): Hex =>
	`0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
export const topicAddress = (topic: string): Hex =>
	`0x${topic.slice(-40).toLowerCase()}`;

export class EthereumRpc {
	constructor(
		private readonly ep: RpcEndpoint,
		private readonly opts: Pick<RpcOptions, "fetchImpl"> = {},
	) {}

	private call<T>(method: string, params: unknown[]): Promise<T> {
		return rpcCall<T>(this.ep, method, params, this.opts);
	}

	batch<T>(calls: { method: string; params: unknown[] }[]): Promise<T[]> {
		return rpcBatch<T>(this.ep, calls, this.opts);
	}

	async chainId(): Promise<number> {
		return hexToNumber(await this.call<Hex>("eth_chainId", []));
	}

	block(tag: "latest" | "finalized" | number): Promise<EthBlock | null> {
		return this.call<EthBlock | null>("eth_getBlockByNumber", [
			typeof tag === "number" ? toHex(tag) : tag,
			false,
		]);
	}

	logs(filter: {
		fromBlock: number;
		toBlock: number;
		address: string[];
		topics: (Hex | Hex[] | null)[];
	}): Promise<EthLog[]> {
		return this.call<EthLog[]>("eth_getLogs", [
			{
				fromBlock: toHex(filter.fromBlock),
				toBlock: toHex(filter.toBlock),
				address: filter.address,
				topics: filter.topics,
			},
		]);
	}

	// Reth begrenzt den Bereich (Standard 100 Blöcke je Aufruf)
	traceFilter(filter: {
		fromBlock: number;
		toBlock: number;
		toAddress?: string[];
		fromAddress?: string[];
	}): Promise<EthTrace[]> {
		return this.call<EthTrace[]>("trace_filter", [
			{
				fromBlock: toHex(filter.fromBlock),
				toBlock: toHex(filter.toBlock),
				...(filter.toAddress ? { toAddress: filter.toAddress } : {}),
				...(filter.fromAddress ? { fromAddress: filter.fromAddress } : {}),
			},
		]);
	}

	traceTransaction(hash: string): Promise<EthTrace[]> {
		return this.call<EthTrace[]>("trace_transaction", [hash]);
	}

	receipt(hash: string): Promise<EthReceipt | null> {
		return this.call<EthReceipt | null>("eth_getTransactionReceipt", [hash]);
	}

	transaction(hash: string): Promise<{ from: Hex; hash: Hex } | null> {
		return this.call("eth_getTransactionByHash", [hash]);
	}

	balance(address: string, tag: "latest" | "finalized"): Promise<bigint> {
		return this.call<Hex>("eth_getBalance", [address, tag]).then(hexToBigInt);
	}

	// ERC-20 balanceOf(address)
	tokenBalance(
		contract: string,
		address: string,
		tag: "latest" | "finalized",
	): Promise<bigint> {
		const data = `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
		return this.call<Hex>("eth_call", [{ to: contract, data }, tag]).then(
			hexToBigInt,
		);
	}
}
