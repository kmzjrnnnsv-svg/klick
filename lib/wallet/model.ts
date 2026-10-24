import type { AssetCode } from "./core/assets";

// Begriffe des Wallet-Modells (rein, ohne Datenbank) — gemeinsam für den
// Wallet-Bereich in Klick (Legacy) und die App both.money (apps/wallet).
// Beträge in Basiseinheiten als Dezimal-Strings, nie Float.

export const WALLET_ACCOUNT_KINDS = ["hot", "cold"] as const;
export type WalletAccountKind = (typeof WALLET_ACCOUNT_KINDS)[number];
export const WALLET_ACCOUNT_PURPOSES = ["own", "client"] as const;
export type WalletAccountPurpose = (typeof WALLET_ACCOUNT_PURPOSES)[number];
export const TRANSFER_STATUS = ["pending", "confirmed", "dropped"] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];
export const SCREENING_RESULTS = ["unchecked", "clear", "hit"] as const;
export type ScreeningResult = (typeof SCREENING_RESULTS)[number];

// Kontostand laut Knoten je Asset (Basiseinheiten): bestätigt nach der
// Bestätigungsregel des Netzes, ausstehend = darüber hinaus gesehen
export type AccountBalances = Partial<
	Record<AssetCode, { confirmed: string; pending: string }>
>;

export const ADDRESS_BOOK_STATUS = [
	"proposed",
	"cooling",
	"active",
	"vetoed",
	"expired",
] as const;
export type AddressBookStatus = (typeof ADDRESS_BOOK_STATUS)[number];

export const PAYOUT_STATUS = [
	"awaiting_approval",
	"approved",
	"signed",
	"broadcast",
	"confirmed",
	"dropped",
	"failed",
	"cancelled",
	"expired",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUS)[number];
export const PAYOUT_SPEEDS = ["slow", "normal", "fast"] as const;
export type PayoutSpeed = (typeof PAYOUT_SPEEDS)[number];
