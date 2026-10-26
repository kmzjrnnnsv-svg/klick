import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { bytea, orgId, pk, ts } from "./_shared";

// Verlauf mit Bitcoin-Anker (Härtung V, ADR-030). Die Prüfsummen-Kette je
// Org (audit_log) bleibt, wie sie ist; regelmäßig geht ein Merkle-Baum über
// die Köpfe aller Ketten als Zeitstempel in OpenTimestamps (Bitcoin). Auf der
// Kette steht nur eine Wurzel über Hashes, keine Inhalte. Schreiben nur
// lib/ledger/service.ts über lib/db/ledger.ts.

// Plattform: ein Anker = eine Wurzel. Enthält nur Hashes (keine Daten einer
// Org), daher wie andere Plattform-Tabellen ohne RLS; Zugriff nur über
// lib/db/ledger.ts.
export const ledgerAnchors = pgTable(
	"ledger_anchors",
	{
		id: pk(),
		// daily | event | manual
		reason: text().notNull(),
		// Merkle-Wurzel (hex); Datei wurzel.bin = diese 32 Bytes
		root: text().notNull(),
		leafCount: integer().notNull(),
		// Kopf der Plattform-Kette (Admin-Ereignisse) mit Pfad
		platform: jsonb().$type<{
			seq: string;
			count: number;
			head: string;
			leaf: string;
			path: { side: "left" | "right"; hash: string }[];
		}>(),
		// .ots-Datei (DetachedTimestampFile über sha256(wurzel.bin))
		ots: bytea(),
		// pending | confirmed | failed
		status: text().notNull().default("pending"),
		calendars: jsonb().$type<string[]>().notNull().default([]),
		bitcoinHeight: integer(),
		// Merkle-Wurzel des Bitcoin-Blocks (Anzeige wie bitcoin-cli)
		bitcoinMerkleRoot: text(),
		confirmedAt: ts(),
		lastUpgradeAt: ts(),
		error: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [index("ledger_anchors_status_idx").on(t.status, t.createdAt)],
);

// Je Org: ihr Kopf in einem Anker und der Pfad zur Wurzel. Die Org sieht nur
// ihre Zeilen (RLS + FORCE), nie die Köpfe anderer Orgs.
export const ledgerHeads = pgTable(
	"ledger_heads",
	{
		id: pk(),
		organizationId: orgId(),
		anchorId: uuid()
			.notNull()
			.references(() => ledgerAnchors.id, { onDelete: "cascade" }),
		// seq und hash des letzten Eintrags der Kette zum Zeitpunkt
		seq: bigint({ mode: "bigint" }).notNull(),
		count: integer().notNull(),
		head: text().notNull(),
		leaf: text().notNull(),
		path: jsonb().$type<{ side: "left" | "right"; hash: string }[]>().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("ledger_heads_org_idx").on(t.organizationId, t.createdAt),
		orgPolicy("ledger_heads"),
	],
).enableRLS();

export type LedgerAnchor = typeof ledgerAnchors.$inferSelect;
export type LedgerHead = typeof ledgerHeads.$inferSelect;
