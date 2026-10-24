import type { PayoutStatus } from "@/lib/wallet/model";
import { formatAmountDe } from "./core/amount";
import { type AssetCode, assetOf } from "./core/assets";
import type { WalletNetwork } from "./core/networks";

// Anzeige-Helfer (rein): Beträge auf Deutsch mit Asset, gekürzte Hashes.

export function amountText(
	network: WalletNetwork,
	asset: AssetCode,
	amount: string | bigint,
): string {
	const decimals = assetOf(network, asset)?.decimals ?? 0;
	return `${formatAmountDe(BigInt(amount), decimals)} ${asset}`;
}

// „bc1qcr8t…306fyu“ — Anfang und Ende genügen zum Wiedererkennen; volle
// Werte stehen im title bzw. beim Kopieren
export function shortHash(value: string, head = 8, tail = 6): string {
	return value.length <= head + tail + 1
		? value
		: `${value.slice(0, head)}…${value.slice(-tail)}`;
}

// Testnetz-Faucets (externe Seiten, nur Links — keine Anbindung)
export const FAUCETS: Partial<
	Record<
		WalletNetwork,
		{ key: "faucetSignet" | "faucetSepolia" | "faucetCircle"; href: string }[]
	>
> = {
	bitcoin_signet: [{ key: "faucetSignet", href: "https://signetfaucet.com" }],
	ethereum_sepolia: [
		{
			key: "faucetSepolia",
			href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
		},
		{ key: "faucetCircle", href: "https://faucet.circle.com" },
	],
};

export const fmtDateTime = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// Farbe je Stand einer Auszahlung (Badge-Varianten)
export const PAYOUT_BADGE: Record<
	PayoutStatus,
	"warning" | "secondary" | "success" | "destructive" | "muted"
> = {
	awaiting_approval: "warning",
	approved: "secondary",
	signed: "secondary",
	broadcast: "secondary",
	confirmed: "success",
	dropped: "destructive",
	failed: "destructive",
	cancelled: "muted",
	expired: "muted",
};
