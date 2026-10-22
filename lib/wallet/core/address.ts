import { Address, NETWORK, TEST_NETWORK } from "@scure/btc-signer";
import { addr } from "micro-eth-signer";
import { NETWORKS, type WalletNetwork } from "./networks";

// Zieladressen prüfen und vereinheitlichen. Bitcoin: Bech32/Bech32m und
// klassische Formate des jeweiligen Netzes; Ethereum: 20 Byte hex, bei
// gemischter Schreibweise muss die EIP-55-Prüfsumme stimmen.

export type AddressCheck =
	| { ok: true; address: string }
	| { ok: false; error: "format" | "checksum" | "network" };

export function checkAddress(
	network: WalletNetwork,
	raw: string,
): AddressCheck {
	const value = raw.trim();
	const info = NETWORKS[network];
	if (info.chain === "bitcoin") {
		const net = info.bech32 === "bc" ? NETWORK : TEST_NETWORK;
		const other = info.bech32 === "bc" ? TEST_NETWORK : NETWORK;
		try {
			Address(net).decode(value);
			// Bech32 einheitlich klein; Base58 bleibt wie eingegeben
			const lower = value.toLowerCase();
			return {
				ok: true,
				address: lower.startsWith(`${info.bech32}1`) ? lower : value,
			};
		} catch {
			try {
				Address(other).decode(value);
				return { ok: false, error: "network" };
			} catch {
				return { ok: false, error: "format" };
			}
		}
	}
	if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return { ok: false, error: "format" };
	const body = value.slice(2);
	const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
	if (mixed && !addr.isValid(value)) return { ok: false, error: "checksum" };
	return { ok: true, address: addr.addChecksum(value.toLowerCase()) };
}

// Vergleich zweier Adressen desselben Netzes (Ethereum ohne Groß/Klein)
export function sameAddress(
	network: WalletNetwork,
	a: string,
	b: string,
): boolean {
	return NETWORKS[network].chain === "ethereum"
		? a.toLowerCase() === b.toLowerCase()
		: a === b;
}
