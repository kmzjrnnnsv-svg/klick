import { formatAmount } from "./amount";
import type { AssetInfo } from "./assets";
import { NETWORKS, type WalletNetwork } from "./networks";

// Zahlungs-Links für den QR-Code beim Empfangen: BIP-21 (Bitcoin) und
// EIP-681 (Ethereum, ETH oder Token-Transfer). Betrag optional.

export function paymentUri(input: {
	network: WalletNetwork;
	asset: AssetInfo;
	address: string;
	amount?: bigint | null;
	label?: string | null;
}): string {
	const info = NETWORKS[input.network];
	if (info.chain === "bitcoin") {
		const q = new URLSearchParams();
		if (input.amount)
			q.set("amount", formatAmount(input.amount, input.asset.decimals));
		if (input.label) q.set("label", input.label);
		const query = q.toString();
		return `bitcoin:${input.address}${query ? `?${query}` : ""}`;
	}
	const chainId = info.chainId as number;
	if (input.asset.kind === "native") {
		// EIP-681: Betrag in Wei als `value`
		return `ethereum:${input.address}@${chainId}${
			input.amount ? `?value=${input.amount.toString()}` : ""
		}`;
	}
	const params = new URLSearchParams({ address: input.address });
	if (input.amount) params.set("uint256", input.amount.toString());
	return `ethereum:${input.asset.contract}@${chainId}/transfer?${params}`;
}
