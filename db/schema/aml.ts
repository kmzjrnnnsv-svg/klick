import {
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
import { orgPolicy } from "../rls";
import {
	json,
	orgId,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import { frameworks } from "./catalog";
import { LICENCE_STAGES } from "./enums";
import { evidence, incidents } from "./grc";

// AML- und CASP-Register: Risikoanalyse, Monitoring-Regelwerk, Verdachts-
// meldungen/STOR, Länder & Korridore, Pflichtenkalender, Eigenmittel,
// Kryptowerte, Gesellschafter, Versicherungen, Verarbeitungsverzeichnis.

export const amlRiskAnalyses = pgTable(
	"aml_risk_analyses",
	{
		id: pk(),
		organizationId: orgId(),
		version: text().notNull(),
		dimensions: json<Record<string, unknown>>().notNull().default({}),
		overallRisk: text({ enum: ["low", "medium", "high"] }),
		summary: text(),
		status: text({ enum: ["draft", "in_review", "approved", "superseded"] })
			.notNull()
			.default("draft"),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		nextReviewAt: date(),
		ownerUserId: userRef(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.version),
		orgPolicy("aml_risk_analyses"),
	],
).enableRLS();

export const amlMonitoringRules = pgTable(
	"aml_monitoring_rules",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		description: text().notNull(),
		threshold: text(),
		rationale: text(),
		legalBasis: text(),
		ownerUserId: userRef(),
		lastTunedAt: date(),
		falsePositiveRate: numeric({ precision: 5, scale: 2 }),
		status: text({ enum: ["active", "paused", "retired"] })
			.notNull()
			.default("active"),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		orgPolicy("aml_monitoring_rules"),
	],
).enableRLS();

// Verdachtsmeldungen (GwG § 43 → goAML) und STOR (MiCAR Art. 92 → BaFin).
// Keine Kunden-PII — goAML/BaFin sind System of Record.
export const suspiciousReports = pgTable(
	"suspicious_reports",
	{
		id: pk(),
		organizationId: orgId(),
		kind: text({ enum: ["gwg_sar", "micar_stor"] })
			.notNull()
			.default("gwg_sar"),
		internalRef: text().notNull(),
		detectedAt: ts().notNull(),
		decidedAt: ts(),
		reportedAt: ts(),
		externalRef: text(),
		category: text(),
		holdUntil: ts(),
		// feldverschlüsselt
		decisionNote: text(),
		status: text({ enum: ["review", "reported", "dismissed"] })
			.notNull()
			.default("review"),
		incidentId: uuid().references(() => incidents.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.internalRef),
		orgPolicy("suspicious_reports"),
	],
).enableRLS();

export const jurisdictions = pgTable(
	"jurisdictions",
	{
		id: pk(),
		organizationId: orgId(),
		iso2: text().notNull(),
		name: text().notNull(),
		euHighRisk: boolean().notNull().default(false),
		fatfStatus: text({ enum: ["none", "grey", "black"] })
			.notNull()
			.default("none"),
		euSanctions: boolean().notNull().default(false),
		usSanctions: boolean().notNull().default(false),
		orgStance: text({ enum: ["allowed", "enhanced_dd", "blocked"] })
			.notNull()
			.default("allowed"),
		corridorStatus: text({
			enum: ["none", "evaluating", "pilot", "active", "suspended"],
		})
			.notNull()
			.default("none"),
		corridorNotes: text(),
		legalNotes: text(),
		reviewedAt: date(),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.iso2), orgPolicy("jurisdictions")],
).enableRLS();

export type DueRule =
	| { kind: "fixed"; month: number; day: number }
	| { kind: "offset"; days: number; from: "period_end" | "event" }
	| { kind: "quarterly"; dayOfMonthAfterQuarter: number }
	| { kind: "monthly"; day: number };

export const obligations = pgTable(
	"obligations",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		legalBasis: text(),
		frameworkId: uuid().references(() => frameworks.id, {
			onDelete: "set null",
		}),
		frequency: text({
			enum: [
				"per_event",
				"daily",
				"weekly",
				"monthly",
				"quarterly",
				"semiannual",
				"annual",
				"triennial",
			],
		}).notNull(),
		dueRule: json<DueRule>(),
		recipient: text({
			enum: [
				"bafin_mvp",
				"bundesbank",
				"bzst",
				"fiu_goaml",
				"bsi",
				"pruefer",
				"kunden",
				"intern",
			],
		})
			.notNull()
			.default("intern"),
		ownerUserId: userRef(),
		leadDays: integer().notNull().default(14),
		appliesFromStage: text({ enum: LICENCE_STAGES }),
		active: boolean().notNull().default(true),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("obligations")],
).enableRLS();

export const obligationRuns = pgTable(
	"obligation_runs",
	{
		id: pk(),
		organizationId: orgId(),
		obligationId: uuid()
			.notNull()
			.references(() => obligations.id, { onDelete: "cascade" }),
		periodLabel: text().notNull(),
		dueAt: date().notNull(),
		completedAt: ts(),
		completedByUserId: userRef(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		status: text({ enum: ["upcoming", "due", "done", "overdue", "waived"] })
			.notNull()
			.default("upcoming"),
		note: text(),
	},
	(t) => [
		unique().on(t.obligationId, t.periodLabel),
		index("obligation_runs_due_idx").on(t.organizationId, t.dueAt),
		orgPolicy("obligation_runs"),
	],
).enableRLS();

export const ownFundsCalculations = pgTable(
	"own_funds_calculations",
	{
		id: pk(),
		organizationId: orgId(),
		periodLabel: text().notNull(),
		micarClass: integer(),
		micarMinCapital: numeric({ precision: 18, scale: 2 }),
		fixedOverheadsPrevYear: numeric({ precision: 18, scale: 2 }),
		micarRequired: numeric({ precision: 18, scale: 2 }),
		zagMethod: text({ enum: ["A", "B", "C"] }),
		monthlyPaymentVolume: numeric({ precision: 18, scale: 2 }),
		zagRequired: numeric({ precision: 18, scale: 2 }),
		zagInitialCapital: numeric({ precision: 18, scale: 2 }),
		totalRequired: numeric({ precision: 18, scale: 2 }),
		availableOwnFunds: numeric({ precision: 18, scale: 2 }),
		buffer: numeric({ precision: 18, scale: 2 }),
		riskBearingCapacity: json<Record<string, unknown>>(),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		status: text({ enum: ["draft", "approved"] })
			.notNull()
			.default("draft"),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.periodLabel),
		orgPolicy("own_funds_calculations"),
	],
).enableRLS();

export const cryptoAssets = pgTable(
	"crypto_assets",
	{
		id: pk(),
		organizationId: orgId(),
		symbol: text().notNull(),
		name: text().notNull(),
		issuer: text(),
		type: text({ enum: ["emt", "art", "native", "other"] })
			.notNull()
			.default("emt"),
		issuerAuthorisation: text(),
		whitepaperRef: text(),
		micarStatus: text({ enum: ["authorised", "not_authorised", "pending"] })
			.notNull()
			.default("pending"),
		networks: stringList(),
		accepted: boolean().notNull().default(false),
		acceptedFrom: date(),
		perTxLimit: numeric({ precision: 18, scale: 2 }),
		reviewedAt: date(),
		notes: text(),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.symbol), orgPolicy("crypto_assets")],
).enableRLS();

export const shareholders = pgTable(
	"shareholders",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		isLegalPerson: boolean().notNull().default(false),
		sharePct: numeric({ precision: 5, scale: 2 }),
		votingPct: numeric({ precision: 5, scale: 2 }),
		// feldverschlüsselt
		uboChain: text(),
		inhaberkontrolleStatus: text({
			enum: ["not_required", "pending", "approved", "rejected"],
		})
			.notNull()
			.default("not_required"),
		thresholdCrossed: integer(),
		notifiedAt: date(),
		approvedAt: date(),
		sourceOfFundsEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		sanctionsCheckedAt: date(),
		...timestamps(),
	},
	(t) => [
		index("shareholders_org_idx").on(t.organizationId),
		orgPolicy("shareholders"),
	],
).enableRLS();

export const insurancePolicies = pgTable(
	"insurance_policies",
	{
		id: pk(),
		organizationId: orgId(),
		type: text({
			enum: ["do", "cyber", "crime", "crypto_custody", "liability"],
		}).notNull(),
		insurer: text().notNull(),
		policyRef: text(),
		coverageLimit: numeric({ precision: 18, scale: 2 }),
		subLimits: json<Record<string, number>>(),
		exclusions: text(),
		validFrom: date(),
		validUntil: date(),
		premium: numeric({ precision: 18, scale: 2 }),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		index("insurance_policies_org_idx").on(t.organizationId),
		orgPolicy("insurance_policies"),
	],
).enableRLS();

// Verzeichnis von Verarbeitungstätigkeiten (DSGVO Art. 30) + DSFA-Pflicht.
export const processingActivities = pgTable(
	"processing_activities",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		purpose: text(),
		dataCategories: stringList(),
		dataSubjects: stringList(),
		recipients: stringList(),
		thirdCountryTransfer: text(),
		retention: text(),
		legalBasis: text(),
		dsfaRequired: boolean().notNull().default(false),
		dsfaEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		index("processing_activities_org_idx").on(t.organizationId),
		orgPolicy("processing_activities"),
	],
).enableRLS();

export type Obligation = typeof obligations.$inferSelect;
export type ObligationRun = typeof obligationRuns.$inferSelect;
