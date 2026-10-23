import { env } from "@/lib/env";
import { NETWORKS, WALLET_NETWORKS, type WalletNetwork } from "./core/networks";
import { BitcoinRpc } from "./rpc/bitcoin";
import { EthereumRpc } from "./rpc/ethereum";
import { endpointFrom } from "./rpc/http";

// Knoten je Netz aus der Umgebung (WALLET_RPC_*). Ohne URL gibt es das Netz
// im Wallet-Bereich nicht — Konten dafür lassen sich nicht anlegen.

export type NodeClient =
	| { chain: "bitcoin"; btc: BitcoinRpc }
	| { chain: "ethereum"; eth: EthereumRpc };

export type NodeClients = Partial<Record<WalletNetwork, NodeClient>>;

const ENV_KEY: Record<WalletNetwork, keyof ReturnType<typeof env>> = {
	bitcoin_signet: "WALLET_RPC_BITCOIN_SIGNET",
	bitcoin_mainnet: "WALLET_RPC_BITCOIN_MAINNET",
	ethereum_sepolia: "WALLET_RPC_ETHEREUM_SEPOLIA",
	ethereum_mainnet: "WALLET_RPC_ETHEREUM_MAINNET",
};

export function nodeClientsFromEnv(): NodeClients {
	const e = env();
	const out: NodeClients = {};
	for (const n of WALLET_NETWORKS) {
		const raw = e[ENV_KEY[n]];
		if (typeof raw !== "string" || !raw) continue;
		const ep = endpointFrom(raw);
		out[n] =
			NETWORKS[n].chain === "bitcoin"
				? { chain: "bitcoin", btc: new BitcoinRpc(ep) }
				: { chain: "ethereum", eth: new EthereumRpc(ep) };
	}
	return out;
}

// Netze mit konfiguriertem Knoten (für Auswahl beim Anlegen eines Kontos)
export function configuredNetworks(): WalletNetwork[] {
	const e = env();
	return WALLET_NETWORKS.filter((n) => {
		const raw = e[ENV_KEY[n]];
		return typeof raw === "string" && raw.length > 0;
	});
}

// Bitcoin Core meldet die Kette als „signet“/„main“ — falsche Kette am
// konfigurierten Endpunkt ist ein harter Fehler (H7)
export const EXPECTED_BTC_CHAIN: Partial<Record<WalletNetwork, string>> = {
	bitcoin_signet: "signet",
	bitcoin_mainnet: "main",
};
