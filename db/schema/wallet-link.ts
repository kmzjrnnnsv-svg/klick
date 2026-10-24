import {
	bigint,
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { appendOnlyOrgPolicies, orgPolicy } from "../rls";
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
import { accessTokens } from "./security";

// Empfang aus both.money (Plan both.money, K2): Verbindung je Klick-Org
// (Token klk_wallet_…), Ereignisprotokoll (nur anhängend, eindeutig je
// Ereignis mit Prüfsumme) und der daraus gepflegte Stand — Konten,
// Bewegungen, Tagesabschlüsse, Auszahlungen, Hinweise. Die Wallet selbst
// lebt in both.money; Klick hält nur, was die Compliance braucht (nie xpub,
// nie Schlüssel). Alles mit RLS + FORCE (Migration 0033).

export type WalletHeartbeat = {
	at: string;
	signer: string;
	nodes: unknown;
	pending: unknown;
};

export type WalletSanctionsList = {
	source: string;
	listVersion: string;
	total: number;
	importedAt: string;
};

export type WalletCeremony = {
	recordedAt: string;
	reason: string;
	policy: { version: number; mode: string; hash: string | null };
	keys: { active: number; persons: number };
	networks: string[];
};

export const walletLinks = pgTable(
	"wallet_links",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		tokenId: uuid().references(() => accessTokens.id, { onDelete: "set null" }),
		status: text({ enum: ["active", "revoked"] })
			.notNull()
			.default("active"),
		// gebunden beim ersten hello; danach nur diese both.money-Org
		walletOrgId: uuid(),
		walletOrgName: text(),
		walletOrgSlug: text(),
		walletLinkId: uuid(),
		custodyMode: text(),
		isOperator: boolean(),
		caspLicenceRef: text(),
		lastSeq: bigint({ mode: "number" }).notNull().default(0),
		lastHelloAt: ts(),
		lastEventAt: ts(),
		lastHeartbeatAt: ts(),
		heartbeat: json<WalletHeartbeat>(),
		lastDayClosed: date(),
		sanctionsList: json<WalletSanctionsList>(),
		ceremony: json<WalletCeremony>(),
		createdByUserId: userRef(),
		revokedAt: ts(),
		revokedByUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		index("wallet_links_org_idx").on(t.organizationId),
		orgPolicy("wallet_links"),
	],
).enableRLS();

export const WALLET_EVENT_RESULTS = [
	"accepted",
	"ignored",
	"rejected",
] as const;
export type WalletEventResult = (typeof WALLET_EVENT_RESULTS)[number];

export const walletLinkEvents = pgTable(
	"wallet_link_events",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: uuid()
			.notNull()
			.references(() => walletLinks.id, { onDelete: "cascade" }),
		eventId: uuid().notNull(),
		seq: bigint({ mode: "number" }).notNull(),
		type: text().notNull(),
		occurredAt: ts().notNull(),
		hash: text().notNull(),
		data: json<unknown>(),
		result: text({ enum: WALLET_EVENT_RESULTS }).notNull(),
		code: text(),
		receivedAt: createdAt(),
	},
	(t) => [
		unique().on(t.organizationId, t.eventId),
		index("wallet_link_events_link_idx").on(t.organizationId, t.linkId, t.seq),
		...appendOnlyOrgPolicies("wallet_link_events"),
	],
).enableRLS();

const linkRef = () =>
	uuid()
		.notNull()
		.references(() => walletLinks.id, { onDelete: "cascade" });

export const cryptoAccounts = pgTable(
	"crypto_accounts",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: linkRef(),
		walletAccountId: uuid().notNull(),
		name: text().notNull(),
		network: text().notNull(),
		kind: text().notNull(),
		purpose: text().notNull(),
		keyFingerprint: text().notNull(),
		firstAddress: text(),
		status: text().notNull(),
		// Eintrag im Verwahrungs-Register (beim ersten Mal angelegt)
		walletId: uuid().references(() => wallets.id, { onDelete: "set null" }),
		openedAt: ts(),
		rev: bigint({ mode: "number" }).notNull(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.linkId, t.walletAccountId),
		orgPolicy("crypto_accounts"),
	],
).enableRLS();

export const cryptoMovements = pgTable(
	"crypto_movements",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: linkRef(),
		transferId: uuid().notNull(),
		walletAccountId: uuid().notNull(),
		network: text().notNull(),
		direction: text({ enum: ["in", "out"] }).notNull(),
		asset: text().notNull(),
		amount: text().notNull(),
		txid: text().notNull(),
		outputRef: text().notNull(),
		address: text().notNull(),
		counterparty: text(),
		blockHeight: integer(),
		blockHash: text(),
		blockTime: ts(),
		confirmations: integer().notNull().default(0),
		status: text().notNull(),
		screening: text().notNull(),
		frozen: boolean().notNull().default(false),
		payoutId: uuid(),
		firstSeenAt: ts().notNull(),
		confirmedAt: ts(),
		rev: bigint({ mode: "number" }).notNull(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.linkId, t.transferId),
		index("crypto_movements_org_seen_idx").on(t.organizationId, t.firstSeenAt),
		orgPolicy("crypto_movements"),
	],
).enableRLS();

export type CryptoBalanceAccount = {
	accountId: string;
	network: string;
	balances: Record<string, { confirmed: string; pending: string }>;
	height: number | null;
	hash: string | null;
	at: string | null;
	frozen: Record<string, string>;
};

export const cryptoBalances = pgTable(
	"crypto_balances",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: linkRef(),
		day: date().notNull(),
		closedAt: ts().notNull(),
		accounts: json<CryptoBalanceAccount[]>().notNull(),
		screening: json<{ clear: number; hit: number; unchecked: number }>(),
		rev: bigint({ mode: "number" }).notNull(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.linkId, t.day),
		orgPolicy("crypto_balances"),
	],
).enableRLS();

export const cryptoPayouts = pgTable(
	"crypto_payouts",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: linkRef(),
		payoutId: uuid().notNull(),
		walletAccountId: uuid().notNull(),
		network: text().notNull(),
		asset: text().notNull(),
		amount: text().notNull(),
		destination: text().notNull(),
		destinationLabel: text().notNull(),
		speed: text().notNull(),
		status: text().notNull(),
		intentId: text().notNull(),
		feeCap: text().notNull(),
		fee: text(),
		txid: text(),
		txids: stringList(),
		requestedAt: ts().notNull(),
		approvedAt: ts(),
		signedAt: ts(),
		broadcastAt: ts(),
		confirmedAt: ts(),
		rev: bigint({ mode: "number" }).notNull(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.linkId, t.payoutId),
		orgPolicy("crypto_payouts"),
	],
).enableRLS();

export const CRYPTO_ALERT_EFFECTS = [
	"incident",
	"suspicious_report",
	"task",
] as const;
export type CryptoAlertEffect = (typeof CRYPTO_ALERT_EFFECTS)[number];

export const cryptoAlerts = pgTable(
	"crypto_alerts",
	{
		id: pk(),
		organizationId: orgId(),
		linkId: linkRef(),
		alertId: text().notNull(),
		code: text().notNull(),
		severity: text().notNull(),
		title: text().notNull(),
		detail: text().notNull(),
		subject: json<{ kind: string; id: string } | null>(),
		raisedAt: ts().notNull(),
		resolvedAt: ts(),
		effect: text({ enum: CRYPTO_ALERT_EFFECTS }).notNull(),
		effectId: uuid(),
		// Aufgabe zusätzlich zur Verdachtsmeldung (Sanktionstreffer)
		taskId: uuid(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.linkId, t.alertId),
		orgPolicy("crypto_alerts"),
	],
).enableRLS();

export type WalletLink = typeof walletLinks.$inferSelect;
export type WalletLinkEvent = typeof walletLinkEvents.$inferSelect;
export type CryptoAccount = typeof cryptoAccounts.$inferSelect;
export type CryptoMovement = typeof cryptoMovements.$inferSelect;
export type CryptoBalance = typeof cryptoBalances.$inferSelect;
export type CryptoPayout = typeof cryptoPayouts.$inferSelect;
export type CryptoAlert = typeof cryptoAlerts.$inferSelect;
