import type { WalletNetwork } from "./networks";

// Feste Asset-Liste je Netz. Nur MiCAR-konforme Stablecoins (USDC, EURC von
// Circle, E-Geld-Token); Anonymitäts-Coins gibt es hier nicht (AMLR Art. 79,
// ab 10.07.2027). Token-Verträge sind fest hinterlegt — Name oder Symbol
// eines Vertrags beweisen nichts.
//
// PRÜFEN vor dem echten Netz: Vertragsadressen gegen die offizielle Liste
// von Circle (developers.circle.com, „USDC/EURC contract addresses“)
// abgleichen. `pnpm wallet:check` liest zusätzlich decimals()/symbol() über
// den eigenen Knoten und meldet Abweichungen (Runbook deploy/README.md).

export type AssetCode = "BTC" | "ETH" | "USDC" | "EURC";

export type AssetInfo = {
	code: AssetCode;
	name: string;
	decimals: number;
	kind: "native" | "erc20";
	// E-Geld-Token (MiCAR Titel IV): für Kund:innen zusätzlich ZAG-Erlaubnis
	emt: boolean;
	contract?: `0x${string}`;
};

const BTC: AssetInfo = {
	code: "BTC",
	name: "Bitcoin",
	decimals: 8,
	kind: "native",
	emt: false,
};
const ETH: AssetInfo = {
	code: "ETH",
	name: "Ether",
	decimals: 18,
	kind: "native",
	emt: false,
};

export const ASSETS: Record<WalletNetwork, readonly AssetInfo[]> = {
	bitcoin_signet: [BTC],
	bitcoin_mainnet: [BTC],
	ethereum_sepolia: [
		ETH,
		{
			code: "USDC",
			name: "USD Coin (Test)",
			decimals: 6,
			kind: "erc20",
			emt: true,
			contract: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
		},
		{
			code: "EURC",
			name: "Euro Coin (Test)",
			decimals: 6,
			kind: "erc20",
			emt: true,
			contract: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
		},
	],
	ethereum_mainnet: [
		ETH,
		{
			code: "USDC",
			name: "USD Coin",
			decimals: 6,
			kind: "erc20",
			emt: true,
			contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		},
		{
			code: "EURC",
			name: "Euro Coin",
			decimals: 6,
			kind: "erc20",
			emt: true,
			contract: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
		},
	],
};

export const assetsFor = (network: WalletNetwork) => ASSETS[network];

export function assetOf(
	network: WalletNetwork,
	code: string,
): AssetInfo | null {
	return ASSETS[network].find((a) => a.code === code) ?? null;
}

// Token-Vertrag → Asset (Eingänge per Transfer-Log). Groß-/Kleinschreibung
// egal; unbekannte Verträge sind kein Asset dieser Wallet.
export function assetByContract(
	network: WalletNetwork,
	contract: string,
): AssetInfo | null {
	const c = contract.toLowerCase();
	return ASSETS[network].find((a) => a.contract?.toLowerCase() === c) ?? null;
}
