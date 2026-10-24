import { formatAmountDe } from "@/lib/wallet/core/amount";
import { ASSETS } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";

// Anzeige der Daten aus both.money (pure): Beträge aus Basiseinheiten mit
// den Stellen des Assets, Netze mit Klartext. Testnetz und echtes Netz nie
// zusammenrechnen.

export function networkLabel(network: string): string {
	return NETWORKS[network as WalletNetwork]?.label ?? network;
}

export function isLiveNetwork(network: string): boolean {
	return NETWORKS[network as WalletNetwork]?.live ?? false;
}

export function assetDecimals(network: string, asset: string): number | null {
	const a = (ASSETS[network as WalletNetwork] ?? []).find(
		(x) => x.code === asset,
	);
	return a ? a.decimals : null;
}

// „0,0015 BTC“; unbekanntes Asset bleibt in Basiseinheiten
export function amountText(
	network: string,
	asset: string,
	base: string | null,
): string {
	if (base === null || !/^\d+$/.test(base)) return "—";
	const d = assetDecimals(network, asset);
	return d === null
		? `${base} (Basiseinheiten) ${asset}`
		: `${formatAmountDe(BigInt(base), d)} ${asset}`;
}
