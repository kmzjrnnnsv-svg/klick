// Netze des Wallet-Bereichs — rein, ohne Netzwerkzugriff. Testnetze zuerst
// (Signet, Sepolia); das echte Netz nur für eigene Bestände nach Freischaltung,
// Kundengelder nur mit CASP-Erlaubnis (Plan: Wallet, Phase 1/3/K).

export const WALLET_NETWORKS = [
	"bitcoin_signet",
	"bitcoin_mainnet",
	"ethereum_sepolia",
	"ethereum_mainnet",
] as const;
export type WalletNetwork = (typeof WALLET_NETWORKS)[number];
export type Chain = "bitcoin" | "ethereum";

// Wann eine Zahlung als bestätigt gilt: feste Zahl von Blöcken (Bitcoin)
// oder der Ethereum-Block-Tag „finalized“ (nach ~2 Epochen, rund 13 Minuten).
export type Finality =
	| { kind: "confirmations"; n: number }
	| { kind: "finalized" };

export type NetworkInfo = {
	key: WalletNetwork;
	chain: Chain;
	live: boolean;
	label: string;
	// Bitcoin: Präfix der Bech32-Adressen; Ethereum: Ketten-ID (EIP-155)
	bech32?: "tb" | "bc";
	chainId?: number;
	finality: Finality;
};

export const NETWORKS: Record<WalletNetwork, NetworkInfo> = {
	bitcoin_signet: {
		key: "bitcoin_signet",
		chain: "bitcoin",
		live: false,
		label: "Bitcoin Signet (Testnetz)",
		bech32: "tb",
		finality: { kind: "confirmations", n: 1 },
	},
	bitcoin_mainnet: {
		key: "bitcoin_mainnet",
		chain: "bitcoin",
		live: true,
		label: "Bitcoin",
		bech32: "bc",
		finality: { kind: "confirmations", n: 3 },
	},
	ethereum_sepolia: {
		key: "ethereum_sepolia",
		chain: "ethereum",
		live: false,
		label: "Ethereum Sepolia (Testnetz)",
		chainId: 11155111,
		finality: { kind: "finalized" },
	},
	ethereum_mainnet: {
		key: "ethereum_mainnet",
		chain: "ethereum",
		live: true,
		label: "Ethereum",
		chainId: 1,
		finality: { kind: "finalized" },
	},
};

export const isWalletNetwork = (v: string): v is WalletNetwork =>
	(WALLET_NETWORKS as readonly string[]).includes(v);

export const networksOf = (chain: Chain): WalletNetwork[] =>
	WALLET_NETWORKS.filter((n) => NETWORKS[n].chain === chain);

// Ob ein Netz für eine Organisation nutzbar ist: Testnetze immer, das echte
// Netz nur mit freigeschaltetem Echtgeld (Richtlinie). Kundengelder prüft
// `clientFundsAllowed` zusätzlich.
export function networkAllowed(
	network: WalletNetwork,
	opts: { liveEnabled: boolean },
): boolean {
	return !NETWORKS[network].live || opts.liveEnabled;
}

// Kundengelder (purpose = client) nur im Testnetz oder mit bestätigter
// CASP-Erlaubnis; Stablecoins (EMT) für Kund:innen zusätzlich nur mit
// ZAG-Erlaubnis (EBA, seit 02.03.2026: Übertragung/Verwahrung von EMT =
// Zahlungsdienst).
export function clientFundsAllowed(
	network: WalletNetwork,
	opts: { caspLicensed: boolean; zagLicensed: boolean; emt: boolean },
): boolean {
	if (!NETWORKS[network].live) return true;
	if (!opts.caspLicensed) return false;
	return !opts.emt || opts.zagLicensed;
}
