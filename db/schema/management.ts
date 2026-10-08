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
	json,
	orgId,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import { controls, frameworks, requirements } from "./catalog";
import { ENTITY_KINDS, NC_PRIORITIES, ROLE_FUNCTIONS } from "./enums";
import { documents, evidence, risks } from "./grc";

// Managementsystem-Schicht (ISO 27001 Klauseln 4–10 und Pendants in DORA,
// NIS2, ZAG-MaRisk, MiCAR, GwG): Kontext, Parteien, Geltungsbereich, Rollen,
// Ziele, Audits, Managementbewertung, KVP, Beschwerden, Hinweise,
// Interessenkonflikte, Kommunikation, Aufsichtskontakte, Betroffenenanfragen.

export const contextIssues = pgTable(
	"context_issues",
	{
		id: pk(),
		organizationId: orgId(),
		scope: text({ enum: ["internal", "external"] })
			.notNull()
			.default("internal"),
		title: text().notNull(),
		description: text(),
		impact: text(),
		relatedRiskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		reviewAt: date(),
		...timestamps(),
	},
	(t) => [
		index("context_issues_org_idx").on(t.organizationId),
		orgPolicy("context_issues"),
	],
).enableRLS();

export const interestedParties = pgTable(
	"interested_parties",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		type: text({
			enum: [
				"regulator",
				"customer",
				"employee",
				"supplier",
				"shareholder",
				"partner",
				"public",
				"community",
			],
		})
			.notNull()
			.default("regulator"),
		expectations: text(),
		requirements: text(),
		relevantFrameworks: stringList(),
		howAddressed: text(),
		contact: text(),
		ownerUserId: userRef(),
		reviewAt: date(),
		...timestamps(),
	},
	(t) => [
		index("interested_parties_org_idx").on(t.organizationId),
		orgPolicy("interested_parties"),
	],
).enableRLS();

export const scopes = pgTable(
	"scopes",
	{
		id: pk(),
		organizationId: orgId(),
		frameworkId: uuid().references(() => frameworks.id, {
			onDelete: "set null",
		}),
		statement: text().notNull(),
		boundaries: text(),
		locations: stringList(),
		services: stringList(),
		exclusions: json<{ what: string; justification: string }[]>()
			.notNull()
			.default([]),
		version: text().notNull().default("1.0"),
		status: text({ enum: ["draft", "approved", "superseded"] })
			.notNull()
			.default("draft"),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [index("scopes_org_idx").on(t.organizationId), orgPolicy("scopes")],
).enableRLS();

export const roleAssignments = pgTable(
	"role_assignments",
	{
		id: pk(),
		organizationId: orgId(),
		function: text({ enum: ROLE_FUNCTIONS }).notNull(),
		userId: userRef(),
		externalName: text(),
		appointedAt: date(),
		deputyUserId: userRef(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		fitProperStatus: text({
			enum: ["not_required", "pending", "confirmed", "rejected"],
		})
			.notNull()
			.default("not_required"),
		// feldverschlüsselt (lib/crypto/fields.ts)
		fitProperChecklist: text(),
		documentsValidUntil: date(),
		reviewAt: date(),
		...timestamps(),
	},
	(t) => [
		index("role_assignments_org_function_idx").on(t.organizationId, t.function),
		orgPolicy("role_assignments"),
	],
).enableRLS();

export const objectives = pgTable(
	"objectives",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		frameworkIds: stringList(),
		kpiName: text(),
		unit: text(),
		target: text(),
		dueAt: date(),
		ownerUserId: userRef(),
		status: text({
			enum: ["open", "on_track", "at_risk", "achieved", "dropped"],
		})
			.notNull()
			.default("open"),
		...timestamps(),
	},
	(t) => [
		index("objectives_org_idx").on(t.organizationId),
		orgPolicy("objectives"),
	],
).enableRLS();

export const kpiMeasurements = pgTable(
	"kpi_measurements",
	{
		id: pk(),
		organizationId: orgId(),
		objectiveId: uuid()
			.notNull()
			.references(() => objectives.id, { onDelete: "cascade" }),
		measuredAt: date().notNull(),
		value: text().notNull(),
		note: text(),
		createdByUserId: userRef(),
	},
	(t) => [
		index("kpi_measurements_objective_idx").on(t.objectiveId),
		orgPolicy("kpi_measurements"),
	],
).enableRLS();

// ── Audits & Auditprogramm ─────────────────────────────────────────────────

export const auditProgrammes = pgTable(
	"audit_programmes",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		cycleStart: date().notNull(),
		cycleYears: integer().notNull().default(3),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("audit_programmes_org_idx").on(t.organizationId),
		orgPolicy("audit_programmes"),
	],
).enableRLS();

export const audits = pgTable(
	"audits",
	{
		id: pk(),
		organizationId: orgId(),
		programmeId: uuid().references(() => auditProgrammes.id, {
			onDelete: "set null",
		}),
		type: text({ enum: ["internal", "external", "certification", "regulator"] })
			.notNull()
			.default("internal"),
		title: text().notNull(),
		scope: text(),
		periodStart: date(),
		periodEnd: date(),
		frameworkIds: stringList(),
		auditorMemberIds: stringList(),
		auditorUserId: userRef(),
		externalAuditor: text(),
		plannedAt: date(),
		performedAt: date(),
		status: text({ enum: ["planned", "in_progress", "reported", "closed"] })
			.notNull()
			.default("planned"),
		reportEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [index("audits_org_idx").on(t.organizationId), orgPolicy("audits")],
).enableRLS();

export const auditProgrammeItems = pgTable(
	"audit_programme_items",
	{
		id: pk(),
		organizationId: orgId(),
		programmeId: uuid()
			.notNull()
			.references(() => auditProgrammes.id, { onDelete: "cascade" }),
		scopeType: text({
			enum: ["domain", "process", "control", "provider", "framework"],
		}).notNull(),
		scopeRef: text().notNull(),
		plannedYear: integer().notNull(),
		riskRating: text({ enum: ["low", "medium", "high"] })
			.notNull()
			.default("medium"),
		frequencyYears: integer().notNull().default(3),
		auditId: uuid().references(() => audits.id, { onDelete: "set null" }),
	},
	(t) => [
		index("audit_programme_items_programme_idx").on(t.programmeId),
		orgPolicy("audit_programme_items"),
	],
).enableRLS();

export const nonconformities = pgTable(
	"nonconformities",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		source: text({
			enum: [
				"audit",
				"incident",
				"control_test",
				"complaint",
				"management_review",
				"self_identified",
			],
		})
			.notNull()
			.default("self_identified"),
		sourceRefId: uuid(),
		title: text().notNull(),
		description: text(),
		rootCause: text(),
		correction: text(),
		correctiveAction: text(),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		dueAt: date(),
		effectivenessCheckAt: date(),
		effectivenessResult: text({
			enum: ["effective", "partially", "ineffective"],
		}),
		status: text({ enum: ["open", "in_progress", "verified", "closed"] })
			.notNull()
			.default("open"),
		// Priorisierung durch die Geschäftsleitung (Funktion management_body).
		priority: text({ enum: NC_PRIORITIES }),
		priorityNote: text(),
		prioritizedByUserId: userRef(),
		prioritizedAt: ts(),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("nonconformities")],
).enableRLS();

export const auditFindings = pgTable(
	"audit_findings",
	{
		id: pk(),
		organizationId: orgId(),
		auditId: uuid()
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		severity: text({ enum: ["observation", "minor", "major", "critical"] })
			.notNull()
			.default("minor"),
		title: text().notNull(),
		description: text(),
		controlId: uuid().references(() => controls.id, { onDelete: "set null" }),
		requirementId: uuid().references(() => requirements.id, {
			onDelete: "set null",
		}),
		status: text({ enum: ["open", "accepted", "in_remediation", "closed"] })
			.notNull()
			.default("open"),
		nonconformityId: uuid().references(() => nonconformities.id, {
			onDelete: "set null",
		}),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("audit_findings_audit_idx").on(t.auditId),
		orgPolicy("audit_findings"),
	],
).enableRLS();

// PBC-Liste (prepared by client): Prüfer fragt Nachweise an.
export const auditRequests = pgTable(
	"audit_requests",
	{
		id: pk(),
		organizationId: orgId(),
		auditId: uuid()
			.notNull()
			.references(() => audits.id, { onDelete: "cascade" }),
		title: text().notNull(),
		description: text(),
		requirementId: uuid().references(() => requirements.id, {
			onDelete: "set null",
		}),
		controlId: uuid().references(() => controls.id, { onDelete: "set null" }),
		requestedByUserId: userRef(),
		assigneeUserId: userRef(),
		dueAt: date(),
		status: text({ enum: ["open", "answered", "accepted", "rejected"] })
			.notNull()
			.default("open"),
		responseNote: text(),
		responseEvidenceIds: stringList(),
		answeredAt: ts(),
		decidedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("audit_requests_audit_idx").on(t.auditId),
		orgPolicy("audit_requests"),
	],
).enableRLS();

export const managementReviews = pgTable(
	"management_reviews",
	{
		id: pk(),
		organizationId: orgId(),
		heldAt: date().notNull(),
		attendeeUserIds: stringList(),
		inputs: json<Record<string, { done: boolean; note?: string }>>()
			.notNull()
			.default({}),
		summary: text(),
		decisions: text(),
		status: text({ enum: ["planned", "held", "done"] })
			.notNull()
			.default("planned"),
		minutesEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		ownerUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		index("management_reviews_org_idx").on(t.organizationId),
		orgPolicy("management_reviews"),
	],
).enableRLS();

export const complaints = pgTable(
	"complaints",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		receivedAt: ts().notNull(),
		channel: text(),
		// pseudonym, feldverschlüsselt
		complainantRef: text(),
		category: text(),
		description: text(),
		acknowledgedAt: ts(),
		ackDueAt: ts(),
		responseDueAt: ts(),
		resolvedAt: ts(),
		outcome: text(),
		escalatedToRegulator: boolean().notNull().default(false),
		ownerUserId: userRef(),
		status: text({ enum: ["open", "acknowledged", "resolved", "closed"] })
			.notNull()
			.default("open"),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("complaints")],
).enableRLS();

export const conflictsOfInterest = pgTable(
	"conflicts_of_interest",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		type: text(),
		partiesInvolved: text(),
		description: text(),
		mitigation: text(),
		disclosedAt: date(),
		ownerUserId: userRef(),
		reviewAt: date(),
		status: text({ enum: ["open", "mitigated", "closed"] })
			.notNull()
			.default("open"),
		...timestamps(),
	},
	(t) => [
		index("conflicts_org_idx").on(t.organizationId),
		orgPolicy("conflicts_of_interest"),
	],
).enableRLS();

// Hinweisgebersystem (HinSchG, MiCAR Art. 116, GwG § 6(5)) — ohne
// Identitätsdaten; Zusammenfassung feldverschlüsselt.
export const whistleblowingReports = pgTable(
	"whistleblowing_reports",
	{
		id: pk(),
		organizationId: orgId(),
		internalRef: text().notNull(),
		receivedAt: ts().notNull(),
		channel: text(),
		category: text(),
		summary: text(),
		ackDueAt: ts(),
		acknowledgedAt: ts(),
		feedbackDueAt: ts(),
		feedbackAt: ts(),
		ownerFunction: text({ enum: ROLE_FUNCTIONS })
			.notNull()
			.default("compliance"),
		status: text({ enum: ["received", "acknowledged", "in_review", "closed"] })
			.notNull()
			.default("received"),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.internalRef),
		orgPolicy("whistleblowing_reports"),
	],
).enableRLS();

// Kommunikationsmatrix (ISO 7.4, DORA Art. 14) inkl. Krisenkontakte.
export const communications = pgTable(
	"communications",
	{
		id: pk(),
		organizationId: orgId(),
		topic: text().notNull(),
		interestedPartyId: uuid().references(() => interestedParties.id, {
			onDelete: "set null",
		}),
		audience: text(),
		purpose: text(),
		channel: text(),
		frequency: text(),
		trigger: text({ enum: ["regular", "incident", "crisis", "change"] })
			.notNull()
			.default("regular"),
		ownerFunction: text({ enum: ROLE_FUNCTIONS }),
		ownerUserId: userRef(),
		templateDocumentId: uuid().references(() => documents.id, {
			onDelete: "set null",
		}),
		legalBasis: text(),
		obligationCode: text(),
		contact: text(),
		...timestamps(),
	},
	(t) => [
		index("communications_org_idx").on(t.organizationId),
		orgPolicy("communications"),
	],
).enableRLS();

export const regulatorInteractions = pgTable(
	"regulator_interactions",
	{
		id: pk(),
		organizationId: orgId(),
		authority: text({
			enum: [
				"bafin",
				"bundesbank",
				"bsi",
				"fiu",
				"dsb",
				"esma",
				"eba",
				"other",
			],
		})
			.notNull()
			.default("bafin"),
		date: date().notNull(),
		subject: text().notNull(),
		direction: text({ enum: ["inbound", "outbound"] })
			.notNull()
			.default("inbound"),
		deadline: date(),
		responseAt: date(),
		ownerUserId: userRef(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		linkedEntityType: text({ enum: ENTITY_KINDS }),
		linkedEntityId: uuid(),
		notes: text(),
		status: text({ enum: ["open", "answered", "closed"] })
			.notNull()
			.default("open"),
		...timestamps(),
	},
	(t) => [
		index("regulator_interactions_org_idx").on(t.organizationId),
		orgPolicy("regulator_interactions"),
	],
).enableRLS();

export const dataSubjectRequests = pgTable(
	"data_subject_requests",
	{
		id: pk(),
		organizationId: orgId(),
		receivedAt: ts().notNull(),
		type: text({
			enum: [
				"auskunft",
				"loeschung",
				"berichtigung",
				"widerspruch",
				"portabilitaet",
				"einschraenkung",
			],
		}).notNull(),
		// feldverschlüsselt
		subjectRef: text(),
		dueAt: ts().notNull(),
		extendedUntil: ts(),
		completedAt: ts(),
		outcome: text(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		status: text({ enum: ["open", "in_progress", "done", "rejected"] })
			.notNull()
			.default("open"),
		...timestamps(),
	},
	(t) => [
		index("dsr_org_idx").on(t.organizationId),
		orgPolicy("data_subject_requests"),
	],
).enableRLS();

export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type Audit = typeof audits.$inferSelect;
export type Nonconformity = typeof nonconformities.$inferSelect;
