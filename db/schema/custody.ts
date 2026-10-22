import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
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
import { evidence, tasks } from "./grc";
import { nonconformities } from "./management";
import { assets, providers, sites } from "./registers";

// Verwahrung von Kryptowerten (MiCAR Art. 70/75, CCSS 1.01–1.06):
// Wallet-Register mit Quorum und Schlüsselinhaber:innen, Zeremonien und
// Wiederherstellungstests sowie die tägliche Abstimmung des
// Kundenvermögens (on-chain gegen internes Kundenbuch). Schlüsselmaterial
// gehört nie hierher — nur öffentliche Adressen bzw. Bezeichnungen.

export const WALLET_KINDS = ["hot", "warm", "cold"] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];
export const WALLET_TECHNOLOGIES = [
	"multisig",
	"mpc",
	"single_key",
	"hsm",
	"sub_custodian",
] as const;
export type WalletTechnology = (typeof WALLET_TECHNOLOGIES)[number];
export const WALLET_PURPOSES = ["client", "own", "operational"] as const;
export type WalletPurpose = (typeof WALLET_PURPOSES)[number];
export const KEY_HOLDER_ROLES = ["signer", "backup", "recovery"] as const;
export type KeyHolderRole = (typeof KEY_HOLDER_ROLES)[number];
export const CEREMONY_KINDS = [
	"generation",
	"rotation",
	"backup_test",
	"recovery_test",
	"destruction",
] as const;
export type CeremonyKind = (typeof CEREMONY_KINDS)[number];
export const RECONCILIATION_STATUS = [
	"matched",
	"difference",
	"reviewed",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUS)[number];

export const wallets = pgTable(
	"wallets",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		name: text().notNull(),
		kind: text({ enum: WALLET_KINDS }).notNull().default("cold"),
		technology: text({ enum: WALLET_TECHNOLOGIES })
			.notNull()
			.default("multisig"),
		purpose: text({ enum: WALLET_PURPOSES }).notNull().default("client"),
		networks: stringList(),
		assetSymbols: stringList(),
		quorumRequired: integer().notNull().default(1),
		quorumTotal: integer().notNull().default(1),
		// öffentliche Adresse bzw. xpub-Bezeichnung — nie Schlüsselmaterial
		addressLabel: text(),
		providerId: uuid().references(() => providers.id, { onDelete: "set null" }),
		hsmAssetId: uuid().references(() => assets.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		lastBackupTestAt: date(),
		nextBackupTestDue: date(),
		lastCeremonyAt: date(),
		status: text({ enum: ["active", "retired"] })
			.notNull()
			.default("active"),
		notes: text(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("wallets_org_idx").on(t.organizationId),
		orgPolicy("wallets"),
	],
).enableRLS();

// Schlüsselinhaber:innen je Wallet (CCSS 1.06). Der Aufbewahrungsort eines
// Schlüsselanteils ist feldverschlüsselt (AAD wallet_key_holders:<id>:location).
export const walletKeyHolders = pgTable(
	"wallet_key_holders",
	{
		id: pk(),
		organizationId: orgId(),
		walletId: uuid()
			.notNull()
			.references(() => wallets.id, { onDelete: "cascade" }),
		userId: userRef(),
		externalName: text(),
		role: text({ enum: KEY_HOLDER_ROLES }).notNull().default("signer"),
		siteId: uuid().references(() => sites.id, { onDelete: "set null" }),
		locationEnc: text(),
		since: date(),
		until: date(),
		vettedAt: date(),
		status: text({ enum: ["active", "revoked"] })
			.notNull()
			.default("active"),
		revokedAt: ts(),
		revokedReason: text(),
		...timestamps(),
	},
	(t) => [
		index("wallet_key_holders_wallet_idx").on(t.organizationId, t.walletId),
		orgPolicy("wallet_key_holders"),
	],
).enableRLS();

// Zeremonien und Tests (CCSS 1.01, 1.03, 1.05): Erzeugung, Rotation,
// Backup-/Wiederherstellungstest, Vernichtung.
export const keyCeremonies = pgTable(
	"key_ceremonies",
	{
		id: pk(),
		organizationId: orgId(),
		walletId: uuid()
			.notNull()
			.references(() => wallets.id, { onDelete: "cascade" }),
		kind: text({ enum: CEREMONY_KINDS }).notNull(),
		heldAt: date().notNull(),
		participantUserIds: stringList(),
		witnesses: text(),
		result: text({ enum: ["pass", "fail"] })
			.notNull()
			.default("pass"),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		notes: text(),
		createdByUserId: userRef(),
		createdAt: createdAt(),
	},
	(t) => [
		index("key_ceremonies_wallet_idx").on(t.organizationId, t.walletId),
		orgPolicy("key_ceremonies"),
	],
).enableRLS();

// Eine Position der Abstimmung: Bestand on-chain gegen Kundenbuch je
// Kryptowert (optional je Wallet). Beträge als Dezimal-Strings — nie Float.
export type ReconciliationLine = {
	symbol: string;
	walletId: string | null;
	onChain: string;
	ledger: string;
	tolerance: string;
	// gesetzt vom Server, wenn der Bestand on-chain genau dem Stand der
	// eigenen Knoten entspricht (Blockhöhe/Hash je Netz)
	source?: {
		kind: "node";
		refs: { network: string; height: number; hash: string; at: string }[];
	} | null;
};

// Tägliche Abstimmung des Kundenvermögens (MiCAR Art. 70 Abs. 1, Art. 75
// Abs. 8): ein Stichtag je Org, Prüfung im Vier-Augen-Prinzip.
export const custodyReconciliations = pgTable(
	"custody_reconciliations",
	{
		id: pk(),
		organizationId: orgId(),
		day: date().notNull(),
		lines: json<ReconciliationLine[]>().notNull(),
		status: text({ enum: RECONCILIATION_STATUS }).notNull().default("matched"),
		shortfall: boolean().notNull().default(false),
		explanation: text(),
		preparedByUserId: userRef(),
		reviewedByUserId: userRef(),
		reviewedAt: ts(),
		nonconformityId: uuid().references(() => nonconformities.id, {
			onDelete: "set null",
		}),
		taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.day),
		orgPolicy("custody_reconciliations"),
	],
).enableRLS();

export type Wallet = typeof wallets.$inferSelect;
export type WalletKeyHolder = typeof walletKeyHolders.$inferSelect;
export type KeyCeremony = typeof keyCeremonies.$inferSelect;
export type CustodyReconciliation = typeof custodyReconciliations.$inferSelect;
