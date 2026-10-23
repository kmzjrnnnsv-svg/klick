import { addr, Transaction } from "micro-eth-signer";
import { checkAddress } from "./address";
import { type AssetCode, assetOf } from "./assets";
import { SpendError } from "./btc-spend";
import { NETWORKS, type WalletNetwork } from "./networks";

// Ethereum-Auszahlung bauen und signieren (rein; läuft im Signer). Immer
// Typ 2 mit expliziter chainId und gasLimit (micro-eth-signer setzt sonst
// Mainnet bzw. nur 21000 Gas). ETH: Ziel + Wert, keine Daten. Token: nur der
// fest hinterlegte Vertrag, Wert 0, Daten exakt transfer(ziel, betrag).

const TRANSFER_SELECTOR = "a9059cbb";

export function transferCalldata(to: string, amount: bigint): `0x${string}` {
	if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new SpendError("destination");
	if (amount <= 0n || amount >= 1n << 256n) throw new SpendError("amount");
	return `0x${TRANSFER_SELECTOR}${to.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

export type EthSpendRequest = {
	network: WalletNetwork;
	asset: AssetCode;
	destination: string;
	amount: bigint;
	nonce: bigint;
	gasLimit: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
	// Wei: gasLimit × maxFeePerGas darf ihn nicht übersteigen
	feeCap: bigint;
	maxFeePerGasCap: bigint;
};

export type EthSpend = {
	raw: string;
	hash: string;
	from: string;
	maxFee: bigint;
};

const fail = (code: string): never => {
	throw new SpendError(code);
};

export function buildEthSpend(
	req: EthSpendRequest,
	privateKey: Uint8Array,
): EthSpend {
	const info = NETWORKS[req.network];
	if (info.chain !== "ethereum" || !info.chainId) fail("network");
	const asset = assetOf(req.network, req.asset);
	if (!asset) fail("asset");
	const dest = checkAddress(req.network, req.destination);
	if (!dest.ok || dest.address !== req.destination) fail("destination");
	if (req.amount <= 0n) fail("amount");
	if (req.nonce < 0n) fail("nonce");
	if (req.gasLimit < 21_000n || req.gasLimit > 200_000n) fail("gas_limit");
	if (req.maxPriorityFeePerGas > req.maxFeePerGas) fail("priority_fee");
	if (req.maxFeePerGas > req.maxFeePerGasCap) fail("fee_rate");
	const maxFee = req.gasLimit * req.maxFeePerGas;
	if (maxFee > req.feeCap) fail("fee_cap");

	const native = asset?.kind === "native";
	const tx = Transaction.prepare(
		{
			type: "eip1559",
			chainId: BigInt(info.chainId as number),
			nonce: req.nonce,
			to: native ? req.destination : (asset?.contract as string),
			value: native ? req.amount : 0n,
			data: native ? "" : transferCalldata(req.destination, req.amount),
			gasLimit: req.gasLimit,
			maxFeePerGas: req.maxFeePerGas,
			maxPriorityFeePerGas: req.maxPriorityFeePerGas,
			accessList: [],
		},
		false,
	);
	const signed = tx.signBy(privateKey);
	if (!signed.verifySignature()) fail("signature");
	return {
		raw: signed.toHex(),
		hash: signed.hash,
		from: addr.addChecksum(signed.sender),
		maxFee,
	};
}
