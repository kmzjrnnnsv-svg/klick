import { sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	pgPolicy,
	pgTable,
	real,
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
import {
	ACCESS_TOKEN_KINDS,
	ENGAGEMENT_KINDS,
	ENGAGEMENT_STATUS,
	FINDING_CATEGORIES,
	FINDING_SEVERITIES,
	FINDING_STATUS,
	RETEST_STATUS,
	SCAN_SOURCES,
	SCAN_TOOLS,
	type ScanCounts,
} from "./enums";
import { evidence, tasks } from "./grc";
import { nonconformities } from "./management";
import { products } from "./products";

// Security-Checks (S5): Zugangstoken ohne Sitzung (ADR-017), Scans und
// Befunde aus Import, API-Ingest und Schnellcheck.

// ADR-017: gespeichert wird nur der SHA-256 des Tokens. Eine zweite
// SELECT-Policy erlaubt die Auflösung ohne Org-Kontext, aber nur für genau
// die Zeile, deren Hash in app.token_hash steht (lib/db/with-token.ts) —
// danach läuft alles normal über withOrg/mutateOrg.
export const accessTokens = pgTable(
	"access_tokens",
	{
		id: pk(),
		organizationId: orgId(),
		kind: text({ enum: ACCESS_TOKEN_KINDS }).notNull(),
		name: text().notNull(),
		// sichtbarer Anfang (klk_ingest_ab12…) zum Wiedererkennen
		prefix: text().notNull(),
		tokenHash: text().notNull().unique(),
		scopes: stringList(),
		subjectType: text({
			enum: ["product", "provider", "assessment", "trust_request"],
		}),
		subjectId: uuid(),
		createdByUserId: userRef(),
		expiresAt: ts().notNull(),
		lastUsedAt: ts(),
		lastUsedIp: text(),
		revokedAt: ts(),
		revokedByUserId: userRef(),
		createdAt: createdAt(),
	},
	(t) => [
		index("access_tokens_org_idx").on(t.organizationId),
		orgPolicy("access_tokens"),
		pgPolicy("access_tokens_by_hash", {
			for: "select",
			to: "public",
			using: sql`token_hash = nullif(current_setting('app.token_hash', true), '')`,
		}),
	],
).enableRLS();

export const securityScans = pgTable(
	"security_scans",
	{
		id: pk(),
		organizationId: orgId(),
		tool: text({ enum: SCAN_TOOLS }).notNull(),
		source: text({ enum: SCAN_SOURCES }).notNull(),
		toolName: text(),
		target: text(),
		productId: uuid().references(() => products.id, { onDelete: "set null" }),
		// Rohdatei (bei Secret-Tools redigiert) als verschlüsselter Nachweis
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		fullScan: boolean().notNull().default(false),
		status: text({ enum: ["running", "completed", "failed"] })
			.notNull()
			.default("completed"),
		error: text(),
		counts: json<ScanCounts>(),
		tokenId: uuid().references(() => accessTokens.id, { onDelete: "set null" }),
		createdByUserId: userRef(),
		startedAt: ts().notNull().defaultNow(),
		finishedAt: ts(),
	},
	(t) => [
		index("security_scans_org_idx").on(t.organizationId, t.startedAt),
		orgPolicy("security_scans"),
	],
).enableRLS();

// Sicherheitsaufträge (S7): manuelle Prüfungen (Pentest u. a.) mit Umfang,
// Regeln, schriftlicher Beauftragung als Pflicht-Nachweis, Bericht, Retest.
// Aktive Tests laufen nie aus Klick — hier stehen Planung, Freigabe,
// Befunde und Ergebnis.
export const securityEngagements = pgTable(
	"security_engagements",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		kind: text({ enum: ENGAGEMENT_KINDS }).notNull().default("pentest"),
		title: text().notNull(),
		status: text({ enum: ENGAGEMENT_STATUS }).notNull().default("planned"),
		productId: uuid().references(() => products.id, { onDelete: "set null" }),
		scope: text(),
		targets: stringList(),
		outOfScope: text(),
		rulesOfEngagement: text(),
		methodology: text(),
		testerExternal: boolean().notNull().default(true),
		testerName: text(),
		testerOrg: text(),
		testerEmail: text(),
		startAt: date(),
		endAt: date(),
		// schriftliche Beauftragung/Einverständnis (§ 202a/c StGB) — Pflicht
		// vor „beauftragt“
		authorizationEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		authorizedByUserId: userRef(),
		authorizedAt: ts(),
		summary: text(),
		reportEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		deliveredAt: ts(),
		result: text({ enum: ["pass", "partial", "fail"] }),
		controlTestIds: stringList(),
		retestDueAt: date(),
		closedAt: ts(),
		statusNote: text(),
		ownerUserId: userRef(),
		createdByUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("security_engagements_org_idx").on(t.organizationId, t.status),
		orgPolicy("security_engagements"),
	],
).enableRLS();

export const securityFindings = pgTable(
	"security_findings",
	{
		id: pk(),
		organizationId: orgId(),
		fingerprint: text().notNull(),
		tool: text({ enum: SCAN_TOOLS }).notNull(),
		ruleId: text().notNull(),
		title: text().notNull(),
		severity: text({ enum: FINDING_SEVERITIES }).notNull(),
		category: text({ enum: FINDING_CATEGORIES }).notNull(),
		target: text(),
		location: text(),
		cwe: text(),
		cve: text(),
		cvss: real(),
		packageName: text(),
		packageVersion: text(),
		fixedVersion: text(),
		// feldverschlüsselt (lib/crypto/fields.ts): Beschreibung, Abhilfe,
		// redigierter Ausschnitt
		details: text(),
		status: text({ enum: FINDING_STATUS }).notNull().default("open"),
		statusNote: text(),
		acceptedUntil: date(),
		firstSeenAt: ts().notNull().defaultNow(),
		lastSeenAt: ts().notNull().defaultNow(),
		resolvedAt: ts(),
		reopenCount: integer().notNull().default(0),
		dueAt: ts(),
		controlCode: text(),
		productId: uuid().references(() => products.id, { onDelete: "set null" }),
		lastScanId: uuid().references(() => securityScans.id, {
			onDelete: "set null",
		}),
		nonconformityId: uuid().references(() => nonconformities.id, {
			onDelete: "set null",
		}),
		taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
		// Sicherheitsauftrag (S7): Herkunft, CVSS-Vektor, Nachtest
		engagementId: uuid().references(() => securityEngagements.id, {
			onDelete: "set null",
		}),
		cvssVector: text(),
		retestStatus: text({ enum: RETEST_STATUS }),
		retestedAt: ts(),
		retestNote: text(),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.fingerprint),
		index("security_findings_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("security_findings"),
	],
).enableRLS();

export type AccessToken = typeof accessTokens.$inferSelect;
export type SecurityScan = typeof securityScans.$inferSelect;
export type SecurityFinding = typeof securityFindings.$inferSelect;
export type SecurityEngagement = typeof securityEngagements.$inferSelect;
