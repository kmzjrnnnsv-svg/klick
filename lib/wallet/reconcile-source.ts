import type { WalletAccount } from "@/db/schema/wallet";
import { formatAmount } from "./core/amount";
import { ASSETS } from "./core/assets";
import { NETWORKS, type WalletNetwork } from "./core/networks";

// Bestand laut eigenen Knoten für die tägliche Abstimmung des
// Kundenvermögens (MiCAR Art. 70/75): je Kryptowert die bestätigten Salden
// aller Kundenkonten (Zweck „client“), mit Blockhöhe/Hash als Quelle.
// Testnetze bekommen ein eigenes Kürzel (BTC.SIGNET) — nie mit dem echten
// Netz zusammengezählt.

export type NodeHoldingSource = {
	network: WalletNetwork;
	height: number;
	hash: string;
	at: string;
};

export type NodeHolding = {
	symbol: string;
	// Dezimal mit Punkt, wie in custody_reconciliations
	onChain: string;
	sources: NodeHoldingSource[];
};

const TESTNET_SUFFIX: Partial<Record<WalletNetwork, string>> = {
	bitcoin_signet: "SIGNET",
	ethereum_sepolia: "SEPOLIA",
};

export const reconciliationSymbol = (network: WalletNetwork, code: string) =>
	NETWORKS[network].live
		? code
		: `${code}.${TESTNET_SUFFIX[network] ?? "TEST"}`;

export function nodeHoldings(
	accounts: readonly Pick<
		WalletAccount,
		| "network"
		| "purpose"
		| "status"
		| "balances"
		| "balanceHeight"
		| "balanceHash"
		| "balanceAt"
	>[],
): NodeHolding[] {
	const by = new Map<
		string,
		{ base: bigint; decimals: number; sources: NodeHoldingSource[] }
	>();
	for (const a of accounts) {
		if (a.purpose !== "client" || a.status !== "active" || !a.balances)
			continue;
		if (a.balanceHeight === null || !a.balanceHash || !a.balanceAt) continue;
		for (const asset of ASSETS[a.network]) {
			const b = a.balances[asset.code];
			if (!b) continue;
			const symbol = reconciliationSymbol(a.network, asset.code);
			const cur = by.get(symbol) ?? {
				base: 0n,
				decimals: asset.decimals,
				sources: [],
			};
			cur.base += BigInt(b.confirmed);
			if (!cur.sources.some((s) => s.network === a.network))
				cur.sources.push({
					network: a.network,
					height: a.balanceHeight,
					hash: a.balanceHash,
					at: a.balanceAt.toISOString(),
				});
			by.set(symbol, cur);
		}
	}
	return [...by]
		.map(([symbol, v]) => ({
			symbol,
			onChain: formatAmount(v.base, v.decimals),
			sources: v.sources,
		}))
		.sort((x, y) => x.symbol.localeCompare(y.symbol));
}
