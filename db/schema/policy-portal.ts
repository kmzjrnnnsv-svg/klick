import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgPolicy,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { createdAt, json, orgId, pk, timestamps, ts } from "./_shared";
import { documentVersions } from "./grc";

// Richtlinien-Portal je Org (M2): Mitarbeitende ohne Konto lesen unter
// /portal/<slug> die gültigen Richtlinien (Verteiler „alle“/„Mitarbeitende“)
// und die freigegebenen Nachweise und bestätigen die Kenntnisnahme. Zugang
// mit Einmal-Code an eine bestätigte Firmen-Domain; danach ein Token
// klk_reader_ (ADR-017) im httpOnly-Cookie. Die zweite SELECT-Policy gibt
// nur eingeschaltete Portale ohne Org-Kontext frei (wie trust_centers_public).

export type PortalDomain = {
	domain: string;
	// Wert für den TXT-Eintrag _klick-portal.<domain>
	token: string;
	verifiedAt: string | null;
	// „sso“ = verifizierte SSO-Domain der Org, „dns“ = eigener TXT-Eintrag
	via: "dns" | "sso" | null;
};

export const policyPortals = pgTable(
	"policy_portals",
	{
		id: pk(),
		organizationId: orgId().unique(),
		slug: text().notNull().unique(),
		enabled: boolean().notNull().default(false),
		// Name der Org für die öffentliche Seite (organization ist ohne
		// Kontext nicht lesbar)
		orgName: text().notNull(),
		domains: json<PortalDomain[]>().notNull().default([]),
		sessionDays: integer().notNull().default(30),
		...timestamps(),
	},
	() => [
		orgPolicy("policy_portals"),
		pgPolicy("policy_portals_public", {
			for: "select",
			to: "public",
			using: sql`enabled`,
		}),
	],
).enableRLS();

// Leser:innen des Portals: nur wer einen Code angefordert hat. Der Code
// liegt nur als HMAC vor, höchstens 5 Versuche, 10 Minuten gültig.
export const policyReaders = pgTable(
	"policy_readers",
	{
		id: pk(),
		organizationId: orgId(),
		email: text().notNull(),
		codeHash: text(),
		codeExpiresAt: ts(),
		codeAttempts: integer().notNull().default(0),
		confirmedAt: ts(),
		lastSeenAt: ts(),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("policy_readers_org_email_uq").on(t.organizationId, t.email),
		orgPolicy("policy_readers"),
	],
).enableRLS();

export const policyReaderAcknowledgements = pgTable(
	"policy_reader_acknowledgements",
	{
		id: pk(),
		organizationId: orgId(),
		readerId: uuid()
			.notNull()
			.references(() => policyReaders.id, { onDelete: "cascade" }),
		documentVersionId: uuid()
			.notNull()
			.references(() => documentVersions.id, { onDelete: "cascade" }),
		acknowledgedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("policy_reader_ack_uq").on(t.readerId, t.documentVersionId),
		index("policy_reader_ack_version_idx").on(t.documentVersionId),
		index("policy_reader_acknowledgements_org_idx").on(t.organizationId),
		orgPolicy("policy_reader_acknowledgements"),
	],
).enableRLS();

export type PolicyPortal = typeof policyPortals.$inferSelect;
export type PolicyReader = typeof policyReaders.$inferSelect;
