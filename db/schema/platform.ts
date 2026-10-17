import {
	bigint,
	boolean,
	date,
	index,
	integer,
	numeric,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { member, organization, user } from "../auth-schema";
import { appendOnlyOrgPolicies, orgPolicy } from "../rls";
import {
	createdAt,
	json,
	orgId,
	pk,
	stringList,
	timestamps,
	ts,
	updatedAt,
	userRef,
} from "./_shared";
import { frameworks } from "./catalog";
import { type CaspService, LICENCE_STAGES, NOTIFICATION_KINDS } from "./enums";
import { priceGroups } from "./pricing";

// Plattform-Tabellen: Org-Einstellungen (RLS), Rechtskataster (RLS),
// Prüfer-Zugänge (RLS), Audit-Log (append-only, RLS), Notifications (RLS),
// CMS-Rechtstexte (global).

export type RiskScales = {
	likelihood: [string, string, string, string, string];
	impact: [string, string, string, string, string];
};
export type RiskAppetite = { acceptable: number; tolerable: number };

// Risikomethodik je Org (lib/compliance/risk-method.ts): Rechenweg, Anker je
// Stufe, Schadensarten und Risikoklassen. Leer = aus riskScales/riskAppetite
// abgeleitet (Bestand), neue Orgs bekommen die Vorlage.
export type Five<T> = [T, T, T, T, T];
export type RiskZone = "acceptable" | "tolerable" | "unacceptable";
export type RiskLevelText = { label: string; anchor: string };
export type RiskDimension = {
	key: string;
	label: string;
	enabled: boolean;
	anchors: Five<string>;
};
// Wer eine Akzeptanz in dieser Klasse freigibt (B4): leer = die
// verantwortliche Person entscheidet allein; sonst Stufen nacheinander,
// z. B. ["department_head", "management_body"]. Fehlt das Feld, gilt das
// bisherige Verhalten (nur über dem Appetit: Workflow risk_acceptance).
export type RiskAcceptanceStep = "department_head" | "management_body";
export type RiskClass = {
	key: string;
	label: string;
	min: number;
	max: number;
	zone: RiskZone;
	meaning: string;
	acceptance?: RiskAcceptanceStep[];
};
export type RiskMethod = {
	aggregation: "sum" | "product";
	likelihood: Five<RiskLevelText>;
	impact: Five<string>;
	dimensions: RiskDimension[];
	classes: RiskClass[];
};
// Lieferantenbewertung je Org (lib/compliance/supplier-rating.ts): Bereichs-
// und Kriteriengewichte, Anker, Schwellen mit Wiedervorlage. Leer = Vorlage.
export type SupplierArea = "general" | "security";
export type SupplierCriterion = {
	code: string;
	area: SupplierArea;
	title: string;
	weight: number;
	anchors: Five<string>;
	enabled: boolean;
	// Zusatzkriterium: nur wenn eines der Rahmenwerke aktiv ist …
	frameworks?: string[];
	// … bzw. nur für diese Partnerarten / nur bei Auslagerung
	partnerTypes?: string[];
	outsourcingOnly?: boolean;
};
export type SupplierThreshold = {
	min: number;
	level: string;
	traffic: "red" | "amber" | "green";
	status: string;
	recommendation: string;
	months: number;
};
export type SupplierMethod = {
	areaWeights: Record<SupplierArea, number>;
	criteria: SupplierCriterion[];
	thresholds: SupplierThreshold[];
	criticalMaxMonths: number;
};

export type ReviewDefaults = {
	control: number;
	document: number;
	risk: number;
	provider: number;
	process: number;
};
export type DocumentNumbering = Record<
	string,
	{ prefix: string; next: number }
>;

export type ApplicationItemState = {
	done: boolean;
	note?: string;
	at: string;
	by?: string;
};

// Stammdaten für Meldungen (Informationsregister ITS 2024/2956, Antragsakten,
// Lieferantenpaket): LEI, Sitzland, zuständige Behörde, Bilanzsumme.
export type EntityProfile = {
	lei?: string;
	country?: string;
	competentAuthority?: string;
	totalAssetsEur?: number;
	legalForm?: string;
	registerNumber?: string;
};

// DLP-Regeln je Org (lib/dlp/policy.ts wertet aus). Gespeichert wird nur,
// was von den Defaults abweicht.
export type DlpRuleAction = "block" | "warn" | "raise" | "allow";
export type DlpPolicy = {
	secret: "block" | "warn";
	payment: DlpRuleAction;
	bank: DlpRuleAction;
	tax: DlpRuleAction;
	// Massen-PII: ab so vielen eindeutigen E-Mail-Adressen oder Telefonnummern
	pii: DlpRuleAction;
	piiThreshold: number;
	// Abfluss-Überwachung: Downloads/Exporte je Person im Fenster
	egressLimit: number;
	egressWindowMinutes: number;
};

export const orgSettings = pgTable(
	"org_settings",
	{
		organizationId: uuid()
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),
		// Org-DEK, mit dem KEK umschlossen (lib/crypto/kms.ts).
		encryptedDek: text().notNull(),
		keyVersion: integer().notNull().default(1),
		sector: text({ enum: ["casp", "bank", "payment", "emi", "other"] })
			.notNull()
			.default("other"),
		caspServices: json<CaspService[]>().notNull().default([]),
		licenceStage: text({ enum: LICENCE_STAGES })
			.notNull()
			.default("0_vorbereitung"),
		licencePartnerProviderId: uuid(),
		nis2Category: text({ enum: ["none", "important", "essential"] })
			.notNull()
			.default("none"),
		nis2Status: text({
			enum: [
				"unchecked",
				"not_affected",
				"affected_pending",
				"affected_registered",
			],
		})
			.notNull()
			.default("unchecked"),
		tlptDesignated: boolean().notNull().default(false),
		issuesTokens: text({ enum: ["none", "art", "emt", "other"] })
			.notNull()
			.default("none"),
		reportingRegimeDefault: text().notNull().default("dora"),
		targetJurisdictions: stringList(),
		riskScales: json<RiskScales>(),
		riskAppetite: json<RiskAppetite>().notNull().default({
			acceptable: 4,
			tolerable: 9,
		}),
		riskMethod: json<RiskMethod>(),
		supplierMethod: json<SupplierMethod>(),
		reviewDefaults: json<ReviewDefaults>().notNull().default({
			control: 12,
			document: 12,
			risk: 3,
			provider: 12,
			process: 12,
		}),
		documentNumbering: json<DocumentNumbering>().notNull().default({}),
		ipAllowlist: stringList(),
		applyBaseline: boolean().notNull().default(false),
		allowSelfApproval: boolean().notNull().default(true),
		// Antragsmappen (/antrag): manuell abgehakte Bestandteile je Code.
		applicationState: json<Record<string, ApplicationItemState>>()
			.notNull()
			.default({}),
		// Setup-Checkliste: bestätigte Prüfungen (z. B. tlptConfirmedAt).
		setupFlags: json<Record<string, string>>().notNull().default({}),
		// Risikovorschläge (B3), die bewusst kein Risiko sind: „kind:id“ →
		// Begründung, wer, wann
		riskProposalDismissals: json<
			Record<string, { reason: string; byUserId: string; at: string }>
		>()
			.notNull()
			.default({}),
		entityProfile: json<EntityProfile>().notNull().default({}),
		dlpPolicy: json<Partial<DlpPolicy>>().notNull().default({}),
		onboardingCompletedAt: ts(),
		plan: text().notNull().default("start"),
		// Preisgruppe (Admin-CMS); leer = Standardgruppe
		priceGroupId: uuid().references(() => priceGroups.id, {
			onDelete: "set null",
		}),
		...timestamps(),
	},
	() => [orgPolicy("org_settings")],
).enableRLS();

export const orgFrameworks = pgTable(
	"org_frameworks",
	{
		id: pk(),
		organizationId: orgId(),
		frameworkId: uuid()
			.notNull()
			.references(() => frameworks.id, { onDelete: "cascade" }),
		ownerUserId: userRef(),
		enabledAt: createdAt(),
		reviewAt: date(),
		targetDate: date(),
		status: text({ enum: ["active", "planned", "retired"] })
			.notNull()
			.default("active"),
	},
	(t) => [
		unique().on(t.organizationId, t.frameworkId),
		orgPolicy("org_frameworks"),
	],
).enableRLS();

// Prüfer:innen und andere zeitlich begrenzte Mitgliedschaften. Eigene
// Tabelle, damit das Better-Auth-Plugin-Schema unangetastet bleibt.
export const memberAccess = pgTable(
	"member_access",
	{
		memberId: uuid()
			.primaryKey()
			.references(() => member.id, { onDelete: "cascade" }),
		organizationId: orgId(),
		accessUntil: ts(),
		grants: stringList(),
		createdByUserId: userRef(),
		createdAt: createdAt(),
	},
	() => [orgPolicy("member_access")],
).enableRLS();

// Append-only, Hash-Kette pro Org (lib/audit-hash.ts). Keine FKs auf
// organization/user: Einträge überleben Org-Löschung und User-Löschung.
export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid().primaryKey(),
		seq: bigint({ mode: "bigint" }).generatedAlwaysAsIdentity(),
		organizationId: uuid(),
		actorUserId: uuid(),
		action: text().notNull(),
		target: text(),
		before: json<unknown>(),
		after: json<unknown>(),
		ip: text(),
		userAgent: text(),
		outcome: text({ enum: ["success", "failure", "denied"] })
			.notNull()
			.default("success"),
		prevHash: text(),
		hash: text().notNull(),
		at: ts().notNull().defaultNow(),
	},
	(t) => [
		index("audit_log_org_seq_idx").on(t.organizationId, t.seq),
		index("audit_log_target_idx").on(t.target),
		index("audit_log_actor_idx").on(t.actorUserId),
		...appendOnlyOrgPolicies("audit_log"),
	],
).enableRLS();

export const notifications = pgTable(
	"notifications",
	{
		id: pk(),
		organizationId: uuid().references(() => organization.id, {
			onDelete: "cascade",
		}),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text({ enum: NOTIFICATION_KINDS }).notNull(),
		title: text().notNull(),
		body: text(),
		link: text(),
		payload: json<Record<string, unknown>>(),
		readAt: ts(),
		emailedAt: ts(),
		createdAt: createdAt(),
	},
	(t) => [
		index("notifications_user_read_idx").on(t.userId, t.readAt),
		orgPolicy("notifications"),
	],
).enableRLS();

export const postureSnapshots = pgTable(
	"posture_snapshots",
	{
		id: pk(),
		organizationId: orgId(),
		frameworkId: uuid()
			.notNull()
			.references(() => frameworks.id, { onDelete: "cascade" }),
		date: date().notNull(),
		coveragePct: numeric({ precision: 5, scale: 2 }),
		progressPct: numeric({ precision: 5, scale: 2 }),
		counts: json<Record<string, number>>().notNull().default({}),
	},
	(t) => [
		unique().on(t.organizationId, t.frameworkId, t.date),
		orgPolicy("posture_snapshots"),
	],
).enableRLS();

// Öffentliche Rechtstexte (Impressum, Datenschutz, AGB) — global, kein RLS.
export const cmsPages = pgTable("cms_pages", {
	id: pk(),
	slug: text().notNull().unique(),
	title: text().notNull(),
	body: text().notNull().default(""),
	updatedAt: updatedAt(),
	updatedByUserId: userRef(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CmsPage = typeof cmsPages.$inferSelect;
