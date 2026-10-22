import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import type { AssetCode } from "../../lib/wallet/core/assets";
import { WALLET_NETWORKS } from "../../lib/wallet/core/networks";
import { orgPolicy } from "../rls";
import { createdAt, json, orgId, pk, timestamps, ts, userRef } from "./_shared";
import { wallets } from "./custody";

// Wallet-Bereich (Plan Wallet, Phase 1): Konten je Netz aus einem
// öffentlichen Kontoschlüssel (xpub), daraus abgeleitete Adressen und die
// Bewegungen, die der Job wallet-sync von den eigenen Knoten liest. Private
// Schlüssel und Seed-Phrasen gehören nie hierher. Beträge in Basiseinheiten
// (Satoshi, Wei, 10^-6 Token) als Dezimal-Strings — nie Float.

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

export const walletAccounts = pgTable(
	"wallet_accounts",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		kind: text({ enum: WALLET_ACCOUNT_KINDS }).notNull().default("cold"),
		purpose: text({ enum: WALLET_ACCOUNT_PURPOSES }).notNull().default("own"),
		// Kontoschlüssel in Standardschreibweise (xpub/tpub, Tiefe 3) —
		// öffentlich, erlaubt nur das Ableiten von Adressen
		accountKey: text().notNull(),
		// Fingerabdruck des Kontoschlüssels (hex), zum Abgleich mit der
		// Hardware-Wallet bzw. dem Signer
		keyFingerprint: text().notNull(),
		// Eintrag im Verwahrungs-Register (MiCAR Art. 75), falls verknüpft
		custodyWalletId: uuid().references(() => wallets.id, {
			onDelete: "set null",
		}),
		nextReceiveIndex: integer().notNull().default(0),
		nextChangeIndex: integer().notNull().default(0),
		// Verlauf ab (Bitcoin: Rescan-Zeitpunkt beim Einrichten des
		// Beobachtungs-Wallets; Ethereum: Startblock des Scans)
		historyFrom: ts(),
		startHeight: integer(),
		// Stand des Abgleichs mit dem Knoten
		nodeReady: boolean().notNull().default(false),
		importedRange: integer().notNull().default(0),
		syncCursor: text(),
		syncHeight: integer(),
		syncedAt: ts(),
		syncError: text(),
		// Stand laut Knoten (Grundlage der automatischen Abstimmung)
		balances: json<AccountBalances>(),
		balanceHeight: integer(),
		balanceHash: text(),
		balanceAt: ts(),
		status: text({ enum: ["active", "retired"] })
			.notNull()
			.default("active"),
		createdByUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.network, t.accountKey),
		index("wallet_accounts_org_idx").on(t.organizationId),
		orgPolicy("wallet_accounts"),
	],
).enableRLS();

// Abgeleitete Adressen: Zweig 0 = Empfang, 1 = Wechselgeld (nur Bitcoin).
// `issuedAt` = beim Empfangen angezeigt; eine Adresse wird nur einmal
// ausgegeben (keine Wiederverwendung bei Bitcoin).
export const walletAddresses = pgTable(
	"wallet_addresses",
	{
		id: pk(),
		organizationId: orgId(),
		accountId: uuid()
			.notNull()
			.references(() => walletAccounts.id, { onDelete: "cascade" }),
		branch: integer().notNull(),
		index: integer().notNull(),
		address: text().notNull(),
		label: text(),
		issuedAt: ts(),
		issuedByUserId: userRef(),
		firstSeenAt: ts(),
		createdAt: createdAt(),
	},
	(t) => [
		unique().on(t.accountId, t.branch, t.index),
		index("wallet_addresses_org_address_idx").on(t.organizationId, t.address),
		orgPolicy("wallet_addresses"),
	],
).enableRLS();

// Bewegungen je Konto. `outputRef` macht eine Bewegung innerhalb einer
// Transaktion eindeutig: Bitcoin `vout:<n>`, Ethereum-Token `log:<index>`,
// ETH aus Aufrufen `trace:<pfad>`.
export const walletTransfers = pgTable(
	"wallet_transfers",
	{
		id: pk(),
		organizationId: orgId(),
		accountId: uuid()
			.notNull()
			.references(() => walletAccounts.id, { onDelete: "cascade" }),
		addressId: uuid().references(() => walletAddresses.id, {
			onDelete: "set null",
		}),
		direction: text({ enum: ["in", "out"] }).notNull(),
		asset: text().$type<AssetCode>().notNull(),
		amount: text().notNull(),
		txid: text().notNull(),
		outputRef: text().notNull(),
		address: text().notNull(),
		counterparty: text(),
		blockHeight: integer(),
		blockHash: text(),
		blockTime: ts(),
		confirmations: integer().notNull().default(0),
		status: text({ enum: TRANSFER_STATUS }).notNull().default("pending"),
		// Sanktionsprüfung vor der Gutschrift (EBA/GL/2024/15): Treffer wird
		// eingefroren und nie als verfügbar gezählt
		screening: text({ enum: SCREENING_RESULTS }).notNull().default("unchecked"),
		screeningRef: text(),
		frozen: boolean().notNull().default(false),
		firstSeenAt: ts().notNull().defaultNow(),
		confirmedAt: ts(),
		updatedAt: ts()
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.accountId, t.txid, t.outputRef, t.asset),
		index("wallet_transfers_org_idx").on(t.organizationId, t.firstSeenAt),
		orgPolicy("wallet_transfers"),
	],
).enableRLS();

// Sperrliste für Adressen (Plattform, ohne Org-Bezug, kein RLS — Zugriff
// über lib/db/sanctions.ts). Quelle `ofac`: digitale Währungsadressen aus
// der SDN-Liste (eigener Import, scripts/import-ofac-addresses.ts),
// `platform`: von Plattform-Admins gesperrt. Ethereum klein geschrieben.
export const sanctionedAddresses = pgTable(
	"sanctioned_addresses",
	{
		id: pk(),
		chain: text({ enum: ["bitcoin", "ethereum"] }).notNull(),
		address: text().notNull(),
		source: text({ enum: ["ofac", "platform"] }).notNull(),
		// SDN-Eintrag bzw. Grund
		reference: text(),
		listVersion: text(),
		addedAt: createdAt(),
	},
	(t) => [unique().on(t.chain, t.address, t.source)],
);

export type WalletAccount = typeof walletAccounts.$inferSelect;
export type WalletAddress = typeof walletAddresses.$inferSelect;
export type WalletTransfer = typeof walletTransfers.$inferSelect;
export type SanctionedAddress = typeof sanctionedAddresses.$inferSelect;
