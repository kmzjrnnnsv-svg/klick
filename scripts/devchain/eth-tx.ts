import { addr, Transaction } from "micro-eth-signer";

// Ethereum-Transaktionen der lokalen Testkette (rein, getestet): dekodieren,
// Signatur und chainId prüfen, Absender zurückgewinnen, ERC-20-transfer()
// erkennen — wie es ein Knoten bei eth_sendRawTransaction täte.

export type DecodedEthTx = {
	hash: string;
	from: string;
	nonce: number;
	to: string;
	value: bigint;
	data: string;
	gasLimit: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export function decodeEthTx(
	raw: string,
	chainId: number,
): DecodedEthTx | { error: string } {
	let tx: ReturnType<typeof Transaction.fromHex>;
	try {
		tx = Transaction.fromHex(raw);
	} catch {
		return { error: "rlp: invalid transaction" };
	}
	if (tx.type !== "eip1559") return { error: "transaction type not supported" };
	const r = tx.raw as {
		chainId: bigint;
		nonce: bigint;
		to: string;
		value: bigint;
		data: string;
		gasLimit: bigint;
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
	};
	if (r.chainId !== BigInt(chainId)) return { error: "invalid chain id" };
	if (!tx.verifySignature()) return { error: "invalid sender" };
	return {
		hash: tx.hash,
		from: addr.addChecksum(tx.sender).toLowerCase(),
		nonce: Number(r.nonce),
		to: r.to.toLowerCase(),
		value: r.value,
		data: r.data === "0x" ? "" : r.data.replace(/^0x/, ""),
		gasLimit: r.gasLimit,
		maxFeePerGas: r.maxFeePerGas,
		maxPriorityFeePerGas: r.maxPriorityFeePerGas,
	};
}

// transfer(address,uint256): Selektor + 2 Wörter
export function decodeTransfer(
	data: string,
): { to: string; amount: bigint } | null {
	const d = data.replace(/^0x/, "").toLowerCase();
	if (d.length !== 8 + 128 || !d.startsWith("a9059cbb")) return null;
	const to = `0x${d.slice(8 + 24, 8 + 64)}`;
	return { to, amount: BigInt(`0x${d.slice(8 + 64)}`) };
}
