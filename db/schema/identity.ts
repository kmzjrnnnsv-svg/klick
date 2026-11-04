import { sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type {
	CheckOutcome,
	CheckReason,
	ExceptionKind,
	IdentityCheckKey,
	IdentityProvider,
	ProviderCapabilities,
} from "../../lib/identity/types";
import { user } from "../auth-schema";
import { orgPolicy } from "../rls";
import { json, orgId, pk, ts, userRef } from "./_shared";

// Identität anbinden (Teil D): Konten aus Entra ID, Google Workspace oder
// Okta nur lesend. Gespeichert wird nur, was die Prüfungen brauchen — nie
// Rohantworten, Telefonnummern, Anmeldeprotokolle, IP-Adressen oder Gruppen.
// Schreiben nur über lib/identity/service.ts.

export const IDENTITY_SOURCE_STATUSES = [
	"pending_consent",
	"active",
	"error",
] as const;
export type IdentitySourceStatus = (typeof IDENTITY_SOURCE_STATUSES)[number];

// Je Org und Anbieter höchstens eine Quelle
export const identitySources = pgTable(
	"identity_sources",
	{
		id: pk(),
		organizationId: orgId(),
		provider: text().$type<IdentityProvider>().notNull(),
		// Tenant-ID (Entra), Kunden-Domain (Google) bzw. Okta-Domain; über alle
		// Orgs eindeutig, sobald gebunden
		tenantKey: text().notNull(),
		status: text({ enum: IDENTITY_SOURCE_STATUSES })
			.notNull()
			.default("pending_consent"),
		// Anbieter-Einstellungen ohne Geheimnis (z. B. Admin-Adresse bei Google)
		settings: json<Record<string, unknown>>().notNull().default({}),
		// Geheimnis (Okta-Token, eigener Google-Schlüssel), enc1
		// identity_sources:<id>:secret_enc; nie im Org-Export
		secretEnc: text(),
		// Einmalwert des laufenden Freigabe-Links (nur SHA-256), bis Ablauf
		consentNonceHash: text(),
		consentExpiresAt: ts(),
		connectedAt: ts(),
		// bestätigte Domains des Tenants beim letzten Abruf
		domains: json<string[]>().notNull().default([]),
		capabilities: json<ProviderCapabilities | null>(),
		lastSyncAt: ts(),
		lastSyncOk: boolean(),
		accountCount: integer(),
		lastError: text(),
		lastErrorAt: ts(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("identity_sources_org_provider_uq").on(
			t.organizationId,
			t.provider,
		),
		// Ein Tenant gehört nur einer Org, sobald er verbunden ist (gilt über
		// alle Orgs, RLS greift bei Indizes nicht); offene Anträge besetzen nichts
		uniqueIndex("identity_sources_tenant_uq")
			.on(t.provider, sql`lower(${t.tenantKey})`)
			.where(sql`${t.status} <> 'pending_consent'`),
		orgPolicy("identity_sources"),
	],
).enableRLS();

export const IDENTITY_MATCH_MODES = ["auto", "manual", "none"] as const;
export type IdentityMatchMode = (typeof IDENTITY_MATCH_MODES)[number];

export const identityAccounts = pgTable(
	"identity_accounts",
	{
		id: pk(),
		organizationId: orgId(),
		sourceId: uuid()
			.notNull()
			.references(() => identitySources.id, { onDelete: "cascade" }),
		externalId: text().notNull(),
		email: text(),
		displayName: text().notNull(),
		kind: text({ enum: ["member", "guest"] }).notNull(),
		enabled: boolean().notNull(),
		isAdmin: boolean().notNull().default(false),
		isTopAdmin: boolean().notNull().default(false),
		adminRoles: json<string[]>().notNull().default([]),
		mfaRegistered: boolean(),
		lastSignInAt: ts(),
		createdAtSource: ts(),
		leaveAt: ts(),
		// Zuordnung zu einer Person in Klick (automatisch oder von Hand)
		matchedUserId: uuid().references(() => user.id, { onDelete: "set null" }),
		matchMode: text({ enum: IDENTITY_MATCH_MODES }).notNull().default("auto"),
		// in Klick als ausgeschieden markiert
		markedLeftAt: ts(),
		markedLeftBy: userRef(),
		firstSeenAt: ts().notNull().defaultNow(),
		lastSeenAt: ts().notNull().defaultNow(),
		// beim Abruf nicht mehr gemeldet; nach 30 Tagen gelöscht
		missingSince: ts(),
	},
	(t) => [
		uniqueIndex("identity_accounts_source_ext_uq").on(t.sourceId, t.externalId),
		index("identity_accounts_org_idx").on(t.organizationId, t.sourceId),
		index("identity_accounts_org_user_idx").on(
			t.organizationId,
			t.matchedUserId,
		),
		orgPolicy("identity_accounts"),
	],
).enableRLS();

// Ausnahmen je Konto (Notfall-, Dienst- und sonstige Konten), befristet
export const identityExceptions = pgTable(
	"identity_exceptions",
	{
		id: pk(),
		organizationId: orgId(),
		accountId: uuid()
			.notNull()
			.references(() => identityAccounts.id, { onDelete: "cascade" }),
		kind: text().$type<ExceptionKind>().notNull(),
		reason: text().notNull(),
		expiresAt: date({ mode: "string" }).notNull(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		revokedAt: ts(),
		revokedBy: userRef(),
	},
	(t) => [
		index("identity_exceptions_org_account_idx").on(
			t.organizationId,
			t.accountId,
		),
		orgPolicy("identity_exceptions"),
	],
).enableRLS();

// Letztes Ergebnis je Prüfung und Org; der Test im Testprogramm entsteht
// beim ersten Lauf, bei einem Wechsel und einmal im Monat (testDue)
export const identityCheckResults = pgTable(
	"identity_check_results",
	{
		id: pk(),
		organizationId: orgId(),
		checkKey: text().$type<IdentityCheckKey>().notNull(),
		result: text().$type<CheckOutcome>().notNull(),
		reasons: json<CheckReason[]>().notNull().default([]),
		affected: json<string[]>().notNull().default([]),
		checkedAt: ts().notNull(),
		lastTestAt: ts(),
		lastTestResult: text().$type<CheckOutcome>(),
		lastTestId: uuid(),
	},
	(t) => [
		uniqueIndex("identity_check_results_org_key_uq").on(
			t.organizationId,
			t.checkKey,
		),
		orgPolicy("identity_check_results"),
	],
).enableRLS();

export const ACCESS_REVIEW_STATUSES = ["open", "closed"] as const;

// Zugriffsprüfung (Rezertifizierung) gegen die Konten einer Quelle (I2)
export const accessReviews = pgTable(
	"access_reviews",
	{
		id: pk(),
		organizationId: orgId(),
		sourceId: uuid().references(() => identitySources.id, {
			onDelete: "set null",
		}),
		title: text().notNull(),
		status: text({ enum: ACCESS_REVIEW_STATUSES }).notNull().default("open"),
		dueAt: date({ mode: "string" }),
		startedBy: userRef(),
		startedAt: ts().notNull().defaultNow(),
		closedBy: userRef(),
		closedAt: ts(),
		evidenceId: uuid(),
		controlTestId: uuid(),
	},
	(t) => [
		index("access_reviews_org_idx").on(t.organizationId, t.startedAt),
		orgPolicy("access_reviews"),
	],
).enableRLS();

export const ACCESS_REVIEW_DECISIONS = ["confirm", "adjust", "revoke"] as const;
export type AccessReviewDecision = (typeof ACCESS_REVIEW_DECISIONS)[number];

export const accessReviewItems = pgTable(
	"access_review_items",
	{
		id: pk(),
		organizationId: orgId(),
		reviewId: uuid()
			.notNull()
			.references(() => accessReviews.id, { onDelete: "cascade" }),
		accountId: uuid().references(() => identityAccounts.id, {
			onDelete: "set null",
		}),
		// Stand des Kontos beim Start (Name, Adresse, Admin, Rollen)
		snapshot: json<Record<string, unknown>>().notNull().default({}),
		reviewerUserId: userRef(),
		decision: text({ enum: ACCESS_REVIEW_DECISIONS }),
		note: text(),
		decidedBy: userRef(),
		decidedAt: ts(),
		taskId: uuid(),
	},
	(t) => [
		index("access_review_items_org_review_idx").on(
			t.organizationId,
			t.reviewId,
		),
		orgPolicy("access_review_items"),
	],
).enableRLS();

export type IdentitySource = typeof identitySources.$inferSelect;
export type IdentityAccount = typeof identityAccounts.$inferSelect;
export type IdentityException = typeof identityExceptions.$inferSelect;
export type IdentityCheckResult = typeof identityCheckResults.$inferSelect;
