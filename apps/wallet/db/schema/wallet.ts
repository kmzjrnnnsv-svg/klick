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
import {
	createdAt,
	json,
	pk,
	stringList,
	timestamps,
	ts,
} from "../../../../db/columns";
import { orgPolicy } from "../../../../db/rls";
import type { AssetCode } from "../../../../lib/wallet/core/assets";
import { WALLET_NETWORKS } from "../../../../lib/wallet/core/networks";
import {
	type AccountBalances,
	ADDRESS_BOOK_STATUS,
	PAYOUT_SPEEDS,
	PAYOUT_STATUS,
	SCREENING_RESULTS,
	TRANSFER_STATUS,
	WALLET_ACCOUNT_KINDS,
	WALLET_ACCOUNT_PURPOSES,
} from "../../../../lib/wallet/model";
import type { CeremonySnapshot } from "../../lib/export/ceremony";
import { user } from "../auth-schema";
import { orgs } from "./orgs";

// Wallet-Tabellen von both.money (aus Klick übernommen, ohne Verknüpfung
// zum Verwahrungs-Register — das führt Klick aus dem Export). Private
// Schlüssel und Seeds gehören nie hierher; Beträge in Basiseinheiten als
// Dezimal-Strings.

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
} from "../../../../lib/wallet/model";

const orgId = () =>
	uuid()
		.notNull()
		.references(() => orgs.id, { onDelete: "cascade" });
const userRef = () =>
	uuid().references(() => user.id, { onDelete: "set null" });

export const walletAccounts = pgTable(
	"wallet_accounts",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		kind: text({ enum: WALLET_ACCOUNT_KINDS }).notNull().default("cold"),
		purpose: text({ enum: WALLET_ACCOUNT_PURPOSES }).notNull().default("own"),
		accountKey: text().notNull(),
		keyFingerprint: text().notNull(),
		nextReceiveIndex: integer().notNull().default(0),
		nextChangeIndex: integer().notNull().default(0),
		historyFrom: ts(),
		startHeight: integer(),
		nodeReady: boolean().notNull().default(false),
		importedRange: integer().notNull().default(0),
		syncCursor: text(),
		syncHeight: integer(),
		syncedAt: ts(),
		syncError: text(),
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
		screening: text({ enum: SCREENING_RESULTS }).notNull().default("unchecked"),
		screeningRef: text(),
		frozen: boolean().notNull().default(false),
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

export const walletAddressBook = pgTable(
	"wallet_address_book",
	{
		id: pk(),
		organizationId: orgId(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		address: text().notNull(),
		label: text().notNull(),
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
		plan: json<Record<string, unknown>>(),
		rawTx: text(),
		txid: text(),
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
		// Vollmacht, auf die diese Auszahlung läuft (Härtung W)
		mandateId: uuid().references((): AnyPgColumn => payoutMandates.id, {
			onDelete: "no action",
		}),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.intentId),
		index("wallet_payouts_org_status_idx").on(t.organizationId, t.status),
		index("wallet_payouts_mandate_idx").on(t.mandateId),
		orgPolicy("wallet_payouts"),
	],
).enableRLS();

// Letzter bekannter Journal-Kopf des Signers (Rücklauf oder Verzweigung →
// Alarm)
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
		// Zuletzt exportierter Stand der Zeremonie (Richtlinie, Schlüssel,
		// Netze) — Änderung ⇒ ceremony.recorded
		ceremony: json<CeremonySnapshot>(),
		updatedAt: ts()
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [unique().on(t.organizationId), orgPolicy("wallet_signer_anchor")],
).enableRLS();

// Sperrliste (Plattform, ohne Org-Bezug, kein RLS — Zugriff über
// lib/db/sanctions.ts)
export const sanctionedAddresses = pgTable(
	"sanctioned_addresses",
	{
		id: pk(),
		chain: text({ enum: ["bitcoin", "ethereum"] }).notNull(),
		address: text().notNull(),
		source: text({ enum: ["ofac", "platform"] }).notNull(),
		reference: text(),
		listVersion: text(),
		addedAt: createdAt(),
	},
	(t) => [unique().on(t.chain, t.address, t.source)],
);

// Kurse aus Chainlink-Feeds über den eigenen Knoten (Plattform, kein RLS)
export const priceTicks = pgTable(
	"price_ticks",
	{
		id: pk(),
		feed: text().notNull(),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		roundId: text().notNull(),
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

// Watchlist und Stand der Einführung je Person und Org
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

// Vollmachten (Härtung W): eine Inhaber:in erlaubt einer Person der
// Bedienung Auszahlungen bis zu einem Betrag in einem Asset an feste Ziele in
// einem Zeitraum — unterschrieben per Sicherheitsschlüssel über den
// kanonischen Text (lib/wallet/core/mandate.ts). Gespeichert wird die ganze
// Assertion, damit jede Auszahlung die Unterschrift neu prüfen kann; Text
// und Felder ändern sich nie (nur Widerruf).
export type MandateAssertion = {
	credentialId: string;
	authenticatorData: string;
	clientDataJSON: string;
	signature: string;
};

export const payoutMandates = pgTable(
	"payout_mandates",
	{
		id: uuid().primaryKey(),
		organizationId: orgId(),
		granteeUserId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		network: text({ enum: WALLET_NETWORKS }).notNull(),
		asset: text().$type<AssetCode>().notNull(),
		perPayout: text().notNull(),
		total: text().notNull(),
		destinations: stringList(),
		validFrom: ts().notNull(),
		validUntil: ts().notNull(),
		issuedByUserId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "no action" }),
		text: text().notNull(),
		textHash: text().notNull(),
		assertion: json<MandateAssertion>().notNull(),
		revokedAt: ts(),
		revokedByUserId: userRef(),
		revokeReason: text(),
		createdAt: createdAt(),
	},
	(t) => [
		index("payout_mandates_grantee_idx").on(
			t.organizationId,
			t.granteeUserId,
			t.network,
			t.asset,
		),
		orgPolicy("payout_mandates"),
	],
).enableRLS();
