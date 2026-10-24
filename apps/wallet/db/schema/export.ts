import {
	bigint,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, json, pk, timestamps, ts } from "../../../../db/columns";
import { orgPolicy } from "../../../../db/rls";
import { user } from "../auth-schema";
import { orgs } from "./orgs";

// Export nach Klick (Plan both.money, W4). Verbindungen je Org, Ausgang
// (Outbox) mit fortlaufender seq je Org, Änderungen aus Triggern und offene
// Auffälligkeiten. Alles mit RLS + FORCE (Migration 0002_export).

const orgId = () =>
	uuid()
		.notNull()
		.references(() => orgs.id, { onDelete: "cascade" });

export const LINK_STATUS = ["active", "paused", "revoked"] as const;
export type LinkStatus = (typeof LINK_STATUS)[number];

export type LinkRejection = {
	id: string;
	seq: number;
	type: string;
	code: string | null;
	at: string;
};

// Verbindung zu einer Klick-Organisation. Das Token (klk_wallet_…) liegt
// nur verschlüsselt mit dem Org-DEK vor (AAD klick_links:<id>:token_enc).
export const klickLinks = pgTable(
	"klick_links",
	{
		id: pk(),
		organizationId: orgId(),
		origin: text().notNull(),
		tokenEnc: text().notNull(),
		tokenHint: text().notNull(),
		status: text({ enum: LINK_STATUS }).notNull().default("active"),
		// null = alle Konten
		accountIds: json<string[] | null>(),
		backfillFrom: ts(),
		backfilledAt: ts(),
		klickOrgName: text(),
		linkRef: text(),
		tokenExpiresAt: ts(),
		ackedSeq: bigint({ mode: "number" }).notNull().default(0),
		lastHelloAt: ts(),
		lastSuccessAt: ts(),
		lastAttemptAt: ts(),
		nextAttemptAt: ts(),
		attempts: integer().notNull().default(0),
		lastError: text(),
		pausedReason: text(),
		rejected: json<LinkRejection[]>(),
		createdByUserId: uuid().references(() => user.id, {
			onDelete: "set null",
		}),
		...timestamps(),
	},
	(t) => [
		index("klick_links_org_idx").on(t.organizationId),
		orgPolicy("klick_links"),
	],
).enableRLS();

// Ausgang: ein Ereignis je Zeile; linkId null = für alle Verbindungen,
// sonst nur für diese (Nachlieferung). Prüfsumme über das kanonische JSON.
export const exportOutbox = pgTable(
	"export_outbox",
	{
		id: uuid().primaryKey(),
		organizationId: orgId(),
		linkId: uuid().references(() => klickLinks.id, { onDelete: "cascade" }),
		seq: bigint({ mode: "number" }).notNull(),
		type: text().notNull(),
		occurredAt: ts().notNull(),
		data: json<unknown>().notNull(),
		hash: text().notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		unique().on(t.organizationId, t.seq),
		index("export_outbox_type_idx").on(t.organizationId, t.type),
		orgPolicy("export_outbox"),
	],
).enableRLS();

// Änderungen, die ein Trigger in derselben Transaktion vermerkt (Konto,
// Bewegung, Auszahlung, Zieladresse) bzw. das Protokoll für einmalige
// Auffälligkeiten (entity „audit“, entityId = audit_log.id). Der Export-Lauf
// macht daraus Ereignisse und löscht die Zeilen.
export const exportChanges = pgTable(
	"export_changes",
	{
		id: bigint({ mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
		organizationId: orgId(),
		entity: text({
			enum: ["account", "transfer", "payout", "destination", "audit"],
		}).notNull(),
		entityId: uuid().notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		index("export_changes_org_idx").on(t.organizationId, t.id),
		orgPolicy("export_changes"),
	],
).enableRLS();

// Offene Auffälligkeiten (für „erledigt“ derselben alertId)
export const exportAlerts = pgTable(
	"export_alerts",
	{
		id: pk(),
		organizationId: orgId(),
		alertId: text().notNull(),
		code: text().notNull(),
		subjectKind: text(),
		subjectId: text(),
		raisedAt: ts().notNull(),
		resolvedAt: ts(),
	},
	(t) => [unique().on(t.organizationId, t.alertId), orgPolicy("export_alerts")],
).enableRLS();
