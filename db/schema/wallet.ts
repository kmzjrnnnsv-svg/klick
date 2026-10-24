import {
	type AnyPgColumn,
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
import {
	type AccountBalances,
	ADDRESS_BOOK_STATUS,
	PAYOUT_SPEEDS,
	PAYOUT_STATUS,
	SCREENING_RESULTS,
	TRANSFER_STATUS,
	WALLET_ACCOUNT_KINDS,
	WALLET_ACCOUNT_PURPOSES,
} from "../../lib/wallet/model";
import { user } from "../auth-schema";
import { orgPolicy } from "../rls";
import {
	createdAt,
	json,
	orgId,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import { wallets } from "./custody";

// Wallet-Bereich (Plan Wallet, Phase 1): Konten je Netz aus einem
// öffentlichen Kontoschlüssel (xpub), daraus abgeleitete Adressen und die
// Bewegungen, die der Job wallet-sync von den eigenen Knoten liest. Private
// Schlüssel und Seed-Phrasen gehören nie hierher. Beträge in Basiseinheiten
// (Satoshi, Wei, 10^-6 Token) als Dezimal-Strings — nie Float.

export {
	type AccountBalances,
	ADDRESS_BOOK_STATUS,
	type AddressBookStatus,
	PAYOUT_SPEEDS,
	PAYOUT_STATUS,
	type PayoutSpeed,
	type PayoutStatus,
	SCREENING_RESULTS,
	type ScreeningResult,
	TRANSFER_STATUS,
	type TransferStatus,
	WALLET_ACCOUNT_KINDS,
	WALLET_ACCOUNT_PURPOSES,
	type WalletAccountKind,
	type WalletAccountPurpose,
} from "../../lib/wallet/model";

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
		// Ausgang aus einer Auszahlung in Klick (Phase 2); ein Ausgang eines
		// Hot-Kontos ohne Auszahlung ist ein Alarm (Signer wird eingefroren)
		payoutId: uuid().references((): AnyPgColumn => walletPayouts.id, {
			onDelete: "set null",
		}),
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

// ── Senden (Plan Wallet, Phase 2) ──────────────────────────────────────
// Zieladressen und Auszahlungen spiegeln Absichten im Signer: freigegeben
// wird nur dort (Sicherheitsschlüssel auf freigabe.raza.work); Klick führt
// Stand, Anzeige und Verlauf. Status kommt aus dem Signer (Job
// wallet-payouts), nie aus einer Eingabe.

export const walletAddressBook = pgTable(
	"wallet_address_book",
	{
		id: pk(),
		organizationId: orgId(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		address: text().notNull(),
		label: text().notNull(),
		// Absicht im Signer (kind whitelist)
		intentId: text().notNull(),
		status: text({ enum: ADDRESS_BOOK_STATUS }).notNull().default("proposed"),
		expiresAt: ts().notNull(),
		approvedAt: ts(),
		activeFrom: ts(),
		screening: text({ enum: SCREENING_RESULTS }).notNull().default("unchecked"),
		screeningRef: text(),
		proposedByUserId: userRef(),
		vetoedByUserId: userRef(),
		vetoedAt: ts(),
		vetoReason: text(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.intentId),
		index("wallet_address_book_org_idx").on(
			t.organizationId,
			t.network,
			t.address,
		),
		orgPolicy("wallet_address_book"),
	],
).enableRLS();

export const walletPayouts = pgTable(
	"wallet_payouts",
	{
		id: pk(),
		organizationId: orgId(),
		accountId: uuid()
			.notNull()
			.references(() => walletAccounts.id, { onDelete: "restrict" }),
		addressBookId: uuid().references(() => walletAddressBook.id, {
			onDelete: "set null",
		}),
		asset: text().$type<AssetCode>().notNull(),
		amount: text().notNull(),
		destination: text().notNull(),
		destinationLabel: text().notNull(),
		// höchste Gebühr in Basiseinheiten der Gebührenwährung (Teil der Absicht)
		feeCap: text().notNull(),
		speed: text({ enum: PAYOUT_SPEEDS }).notNull().default("normal"),
		status: text({ enum: PAYOUT_STATUS })
			.notNull()
			.default("awaiting_approval"),
		intentId: text().notNull(),
		intentText: text().notNull(),
		expiresAt: ts().notNull(),
		approvedAt: ts(),
		signableAt: ts(),
		// zuletzt an den Signer gegebener Ausgabeplan (Eingänge bzw. Nonce/Gas)
		plan: json<Record<string, unknown>>(),
		rawTx: text(),
		txid: text(),
		// frühere Fassungen (Gebührenerhöhung, Abbruch) — alle gehören hierher
		txids: stringList(),
		fee: text(),
		nonce: text(),
		signedAt: ts(),
		broadcastAt: ts(),
		confirmedAt: ts(),
		bumpRequested: boolean().notNull().default(false),
		cancelRequested: boolean().notNull().default(false),
		attempts: integer().notNull().default(0),
		error: text(),
		createdByUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.intentId),
		index("wallet_payouts_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("wallet_payouts"),
	],
).enableRLS();

// Letzter bekannter Journal-Kopf des Signers (seq, Hash). Läuft er zurück
// oder verzweigt er, ist das Journal ersetzt worden → Alarm.
export const walletSignerAnchor = pgTable(
	"wallet_signer_anchor",
	{
		id: pk(),
		organizationId: orgId(),
		seq: integer().notNull(),
		head: text().notNull(),
		bundleHash: text(),
		policyHash: text(),
		frozen: boolean().notNull().default(false),
		frozenReason: text(),
		checkedAt: ts(),
		unreachableSince: ts(),
		alertedAt: ts(),
		updatedAt: ts()
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [unique().on(t.organizationId), orgPolicy("wallet_signer_anchor")],
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

// Kurse aus Chainlink-Feeds über den eigenen Knoten (Plattform, ohne
// Org-Bezug, kein RLS — Zugriff über lib/db/prices.ts). Eine Zeile je Runde.
export const priceTicks = pgTable(
	"price_ticks",
	{
		id: pk(),
		feed: text().notNull(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		roundId: text().notNull(),
		// Antwort des Feeds (ganzzahlig) und seine Nachkommastellen
		answer: text().notNull(),
		decimals: integer().notNull(),
		updatedAt: ts().notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		unique().on(t.feed, t.network, t.roundId),
		index("price_ticks_feed_time_idx").on(t.feed, t.updatedAt),
	],
);

// Persönliche Einstellungen im Wallet-Bereich: Watchlist und Stand der
// geführten Einführung (je Person und Org).
export const walletPreferences = pgTable(
	"wallet_preferences",
	{
		id: pk(),
		organizationId: orgId(),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		pairs: stringList(),
		introStep: text(),
		introCompletedAt: ts(),
		introDeferredAt: ts(),
		updatedAt: ts()
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.organizationId, t.userId),
		orgPolicy("wallet_preferences"),
	],
).enableRLS();

export type WalletAccount = typeof walletAccounts.$inferSelect;
export type WalletAddress = typeof walletAddresses.$inferSelect;
export type WalletTransfer = typeof walletTransfers.$inferSelect;
export type SanctionedAddress = typeof sanctionedAddresses.$inferSelect;
export type PriceTick = typeof priceTicks.$inferSelect;
export type WalletPreferences = typeof walletPreferences.$inferSelect;
export type WalletAddressBookEntry = typeof walletAddressBook.$inferSelect;
export type WalletPayout = typeof walletPayouts.$inferSelect;
export type WalletSignerAnchor = typeof walletSignerAnchor.$inferSelect;
