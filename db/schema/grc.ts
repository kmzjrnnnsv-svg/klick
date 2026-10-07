import {
	type AnyPgColumn,
	boolean,
	date,
	foreignKey,
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
import { controls, requirements } from "./catalog";
import {
	CLASSIFICATIONS,
	CONTROL_TEST_METHODS,
	ENTITY_KINDS,
	IMPL_STATUS,
	type INCIDENT_REGIMES,
	ROLE_FUNCTIONS,
} from "./enums";
import { assets, processes, providers } from "./registers";

// GRC-Kern je Organisation: Control-Status, Anwendbarkeit, Nachweise,
// Dokumentenlenkung, Freigaben, Beschlüsse, Risiken, Vorfälle, Aufgaben,
// Zusammenarbeit. Alle Tabellen RLS-gescoped.

// ── Controls & Anwendbarkeit ───────────────────────────────────────────────

export const controlImplementations = pgTable(
	"control_implementations",
	{
		id: pk(),
		organizationId: orgId(),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
		status: text({ enum: IMPL_STATUS }).notNull().default("not_started"),
		source: text({ enum: ["onboarding", "baseline", "manual"] })
			.notNull()
			.default("onboarding"),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		note: text(),
		implementedAt: ts(),
		lastReviewedAt: ts(),
		nextReviewAt: date(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.controlId),
		index("control_impl_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("control_implementations"),
	],
).enableRLS();

export const requirementApplicability = pgTable(
	"requirement_applicability",
	{
		id: pk(),
		organizationId: orgId(),
		requirementId: uuid()
			.notNull()
			.references(() => requirements.id, { onDelete: "cascade" }),
		applicable: boolean().notNull().default(true),
		note: text(),
		source: text({
			enum: ["services", "lex_specialis", "stage", "rule", "manual"],
		})
			.notNull()
			.default("manual"),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.requirementId),
		orgPolicy("requirement_applicability"),
	],
).enableRLS();

// ── Nachweise ──────────────────────────────────────────────────────────────

export const evidence = pgTable(
	"evidence",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		type: text({
			enum: [
				"document",
				"screenshot",
				"link",
				"config_export",
				"attestation",
				"log_extract",
			],
		})
			.notNull()
			.default("document"),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		fileName: text(),
		mimeType: text(),
		sizeBytes: integer(),
		// S3-Key org/<orgId>/nachweise/<uuid>; Inhalt mit Org-DEK verschlüsselt.
		storageKey: text(),
		keyVersion: integer(),
		sha256: text(),
		url: text(),
		validUntil: date(),
		supersedesId: uuid().references((): AnyPgColumn => evidence.id, {
			onDelete: "set null",
		}),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("evidence_org_idx").on(t.organizationId),
		orgPolicy("evidence"),
	],
).enableRLS();

export const controlEvidence = pgTable(
	"control_evidence",
	{
		id: pk(),
		organizationId: orgId(),
		implementationId: uuid().notNull(),
		evidenceId: uuid()
			.notNull()
			.references(() => evidence.id, { onDelete: "cascade" }),
	},
	(t) => [
		// Kurzer Name: der generierte würde Postgres' 63-Zeichen-Grenze reißen.
		foreignKey({
			name: "control_evidence_impl_fk",
			columns: [t.implementationId],
			foreignColumns: [controlImplementations.id],
		}).onDelete("cascade"),
		unique().on(t.implementationId, t.evidenceId),
		orgPolicy("control_evidence"),
	],
).enableRLS();

export const controlTests = pgTable(
	"control_tests",
	{
		id: pk(),
		organizationId: orgId(),
		implementationId: uuid().references(() => controlImplementations.id, {
			onDelete: "cascade",
		}),
		assetId: uuid().references(() => assets.id, { onDelete: "set null" }),
		processId: uuid().references(() => processes.id, { onDelete: "set null" }),
		method: text({ enum: CONTROL_TEST_METHODS }).notNull(),
		scope: text(),
		plannedAt: date(),
		testedAt: ts(),
		testerUserId: userRef(),
		result: text({ enum: ["pass", "partial", "fail"] }),
		notes: text(),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		nextTestAt: date(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("control_tests_impl_idx").on(t.implementationId),
		orgPolicy("control_tests"),
	],
).enableRLS();

// ── Dokumentenlenkung ──────────────────────────────────────────────────────

export const DOCUMENT_TYPES = [
	"policy",
	"procedure",
	"concept",
	"plan",
	"manual",
	"template",
	"record",
	"report",
	"contract",
	"form",
] as const;

export const DOCUMENT_STATUS = [
	"draft",
	"in_review",
	"approved",
	"published",
	"retired",
	"superseded",
] as const;

export const documents = pgTable(
	"documents",
	{
		id: pk(),
		organizationId: orgId(),
		docNumber: text().notNull(),
		title: text().notNull(),
		type: text({ enum: DOCUMENT_TYPES }).notNull().default("policy"),
		domain: text(),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		ownerUserId: userRef(),
		authorUserId: userRef(),
		assigneeUserId: userRef(),
		approverFunction: text({ enum: ROLE_FUNCTIONS }),
		bodyMarkdown: text(),
		fileEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		version: text().notNull().default("0.1"),
		status: text({ enum: DOCUMENT_STATUS }).notNull().default("draft"),
		effectiveFrom: date(),
		reviewCycleMonths: integer().notNull().default(12),
		nextReviewAt: date(),
		supersedesDocumentId: uuid().references((): AnyPgColumn => documents.id, {
			onDelete: "set null",
		}),
		parentDocumentId: uuid().references((): AnyPgColumn => documents.id, {
			onDelete: "set null",
		}),
		// Rollen/Funktionen, die die Kenntnisnahme bestätigen müssen.
		distribution: stringList(),
		retentionYears: integer(),
		legalBasisRefs: stringList(),
		language: text().notNull().default("de"),
		templateCode: text(),
		isoMandatory: boolean().notNull().default(false),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.docNumber),
		index("documents_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("documents"),
	],
).enableRLS();

export const documentVersions = pgTable(
	"document_versions",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		version: text().notNull(),
		bodyMarkdown: text(),
		fileEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		changeSummary: text().notNull(),
		approvedByUserId: userRef(),
		approvedAt: ts(),
		publishedAt: ts(),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [unique().on(t.documentId, t.version), orgPolicy("document_versions")],
).enableRLS();

export const documentControls = pgTable(
	"document_controls",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.controlId),
		orgPolicy("document_controls"),
	],
).enableRLS();

export const documentProcesses = pgTable(
	"document_processes",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.processId),
		orgPolicy("document_processes"),
	],
).enableRLS();

export const documentRequirements = pgTable(
	"document_requirements",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		requirementId: uuid()
			.notNull()
			.references(() => requirements.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.documentId, t.requirementId),
		orgPolicy("document_requirements"),
	],
).enableRLS();

export const documentAcknowledgements = pgTable(
	"document_acknowledgements",
	{
		id: pk(),
		organizationId: orgId(),
		documentId: uuid()
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		documentVersionId: uuid().notNull(),
		userId: uuid().notNull(),
		acknowledgedAt: ts().notNull().defaultNow(),
		method: text({ enum: ["click", "training"] })
			.notNull()
			.default("click"),
	},
	(t) => [
		foreignKey({
			name: "document_ack_version_fk",
			columns: [t.documentVersionId],
			foreignColumns: [documentVersions.id],
		}).onDelete("cascade"),
		unique().on(t.documentVersionId, t.userId),
		orgPolicy("document_acknowledgements"),
	],
).enableRLS();

// ── Prozess-Verknüpfungen ──────────────────────────────────────────────────

export const processControls = pgTable(
	"process_controls",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.controlId), orgPolicy("process_controls")],
).enableRLS();

export const processAssets = pgTable(
	"process_assets",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		assetId: uuid()
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.assetId), orgPolicy("process_assets")],
).enableRLS();

export const processProviders = pgTable(
	"process_providers",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		providerId: uuid()
			.notNull()
			.references(() => providers.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.processId, t.providerId),
		orgPolicy("process_providers"),
	],
).enableRLS();

// ── Freigabe-Workflows ─────────────────────────────────────────────────────

export type ApprovalStep = {
	order: number;
	approverRule: string; // function:<role_function> | role:<orgRole> | user:<id> | owner_of_entity | not_requester
	minApprovers?: number;
	slaDays?: number;
};

export const approvalWorkflows = pgTable(
	"approval_workflows",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		kind: text().notNull(),
		name: text().notNull(),
		steps: json<ApprovalStep[]>().notNull().default([]),
		enabled: boolean().notNull().default(false),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.kind),
		orgPolicy("approval_workflows"),
	],
).enableRLS();

export const approvalRequests = pgTable(
	"approval_requests",
	{
		id: pk(),
		organizationId: orgId(),
		workflowId: uuid()
			.notNull()
			.references(() => approvalWorkflows.id, { onDelete: "restrict" }),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		entityVersionRef: text(),
		requestedByUserId: userRef(),
		requestedAt: ts().notNull().defaultNow(),
		currentStep: integer().notNull().default(1),
		status: text({
			enum: [
				"pending",
				"approved",
				"rejected",
				"changes_requested",
				"withdrawn",
				"expired",
			],
		})
			.notNull()
			.default("pending"),
		dueAt: ts(),
		decidedAt: ts(),
		// Solo-Modus: Vier-Augen nicht erfüllbar → begründete Selbstfreigabe.
		selfApproved: boolean().notNull().default(false),
		selfApprovalReason: text(),
	},
	(t) => [
		index("approval_requests_entity_idx").on(t.entityType, t.entityId),
		index("approval_requests_status_idx").on(t.organizationId, t.status),
		orgPolicy("approval_requests"),
	],
).enableRLS();

export const approvalDecisions = pgTable(
	"approval_decisions",
	{
		id: pk(),
		organizationId: orgId(),
		requestId: uuid()
			.notNull()
			.references(() => approvalRequests.id, { onDelete: "cascade" }),
		step: integer().notNull(),
		approverUserId: userRef(),
		decision: text({
			enum: ["approved", "rejected", "changes_requested"],
		}).notNull(),
		note: text(),
		decidedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("approval_decisions_request_idx").on(t.requestId),
		orgPolicy("approval_decisions"),
	],
).enableRLS();

export const delegations = pgTable(
	"delegations",
	{
		id: pk(),
		organizationId: orgId(),
		fromUserId: uuid().notNull(),
		toUserId: uuid().notNull(),
		scope: text().notNull().default("approvals"),
		validFrom: ts().notNull().defaultNow(),
		validUntil: ts().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("delegations_from_idx").on(t.fromUserId),
		orgPolicy("delegations"),
	],
).enableRLS();

// ── Beschlüsse der Leitung ─────────────────────────────────────────────────

export const resolutions = pgTable(
	"resolutions",
	{
		id: pk(),
		organizationId: orgId(),
		resolutionNumber: text().notNull(),
		date: date().notNull(),
		body: text({ enum: ["management", "supervisory", "shareholders"] })
			.notNull()
			.default("management"),
		subject: text().notNull(),
		decisionText: text().notNull(),
		legalBasis: text(),
		requiredCode: text(),
		linkedEntityType: text({ enum: ENTITY_KINDS }),
		linkedEntityId: uuid(),
		attendeeUserIds: stringList(),
		minutesEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		approvalRequestId: uuid().references(() => approvalRequests.id, {
			onDelete: "set null",
		}),
		createdByUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.organizationId, t.resolutionNumber),
		orgPolicy("resolutions"),
	],
).enableRLS();

// ── Risiken ────────────────────────────────────────────────────────────────

export const RISK_CATEGORIES = [
	"strategic",
	"operational",
	"ict_cyber",
	"compliance_legal",
	"financial",
	"third_party",
	"aml_fraud",
	"custody_keys",
	"market_liquidity",
] as const;

export const risks = pgTable(
	"risks",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		category: text({ enum: RISK_CATEGORIES }).notNull().default("operational"),
		likelihood: integer().notNull().default(3),
		impact: integer().notNull().default(3),
		treatment: text({ enum: ["mitigate", "accept", "transfer", "avoid"] })
			.notNull()
			.default("mitigate"),
		residualLikelihood: integer(),
		residualImpact: integer(),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		status: text({ enum: ["open", "in_treatment", "accepted", "closed"] })
			.notNull()
			.default("open"),
		reviewAt: date(),
		acceptedByUserId: userRef(),
		acceptedAt: ts(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("risks_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("risks"),
	],
).enableRLS();

export const riskControls = pgTable(
	"risk_controls",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.riskId, t.controlId), orgPolicy("risk_controls")],
).enableRLS();

export const riskAssets = pgTable(
	"risk_assets",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		assetId: uuid()
			.notNull()
			.references(() => assets.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.riskId, t.assetId), orgPolicy("risk_assets")],
).enableRLS();

export const processRisks = pgTable(
	"process_risks",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.processId, t.riskId), orgPolicy("process_risks")],
).enableRLS();

// ── Aufgaben & Zusammenarbeit ──────────────────────────────────────────────

export const tasks = pgTable(
	"tasks",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		assigneeUserId: userRef(),
		createdByUserId: userRef(),
		dueAt: date(),
		status: text({ enum: ["todo", "doing", "blocked", "done"] })
			.notNull()
			.default("todo"),
		priority: text({ enum: ["low", "normal", "high", "critical"] })
			.notNull()
			.default("normal"),
		entityType: text({ enum: ENTITY_KINDS }),
		entityId: uuid(),
		sourceKind: text({
			enum: [
				"manual",
				"remediation",
				"treatment",
				"review",
				"incident_action",
				"evidence_request",
				"access_review",
				"change",
				"obligation",
				"acknowledgement",
				"audit_request",
				"bundle",
				"escalation",
				"system",
			],
		})
			.notNull()
			.default("manual"),
		bundleCode: text(),
		completedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("tasks_assignee_status_idx").on(t.assigneeUserId, t.status),
		index("tasks_entity_idx").on(t.entityType, t.entityId),
		orgPolicy("tasks"),
	],
).enableRLS();

export const riskTreatments = pgTable(
	"risk_treatments",
	{
		id: pk(),
		organizationId: orgId(),
		riskId: uuid()
			.notNull()
			.references(() => risks.id, { onDelete: "cascade" }),
		title: text().notNull(),
		description: text(),
		ownerUserId: userRef(),
		dueAt: date(),
		status: text({ enum: ["planned", "in_progress", "done", "dropped"] })
			.notNull()
			.default("planned"),
		taskId: uuid().references(() => tasks.id, { onDelete: "set null" }),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("risk_treatments_risk_idx").on(t.riskId),
		orgPolicy("risk_treatments"),
	],
).enableRLS();

export const comments = pgTable(
	"comments",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		authorUserId: userRef(),
		bodyMarkdown: text().notNull(),
		parentId: uuid().references((): AnyPgColumn => comments.id, {
			onDelete: "cascade",
		}),
		resolvedAt: ts(),
		editedAt: ts(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("comments_entity_idx").on(t.entityType, t.entityId),
		orgPolicy("comments"),
	],
).enableRLS();

export const watchers = pgTable(
	"watchers",
	{
		id: pk(),
		organizationId: orgId(),
		entityType: text({ enum: ENTITY_KINDS }).notNull(),
		entityId: uuid().notNull(),
		userId: uuid().notNull(),
	},
	(t) => [
		unique().on(t.entityType, t.entityId, t.userId),
		orgPolicy("watchers"),
	],
).enableRLS();

export type TaskBundleItem = {
	title: string;
	assigneeRule?: string;
	offsetDays?: number;
	description?: string;
};

export const taskBundles = pgTable(
	"task_bundles",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		name: text().notNull(),
		description: text(),
		items: json<TaskBundleItem[]>().notNull().default([]),
		triggerEntityType: text({ enum: ENTITY_KINDS }),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("task_bundles")],
).enableRLS();

// ── Ausnahmen & Schadensfälle ──────────────────────────────────────────────

export const exceptions = pgTable(
	"exceptions",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		controlId: uuid().references(() => controls.id, { onDelete: "set null" }),
		documentId: uuid().references(() => documents.id, { onDelete: "set null" }),
		justification: text().notNull(),
		compensatingControls: text(),
		riskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		approvalRequestId: uuid().references(() => approvalRequests.id, {
			onDelete: "set null",
		}),
		ownerUserId: userRef(),
		validUntil: date().notNull(),
		status: text({ enum: ["requested", "approved", "expired", "revoked"] })
			.notNull()
			.default("requested"),
		...timestamps(),
	},
	(t) => [
		index("exceptions_org_idx").on(t.organizationId),
		orgPolicy("exceptions"),
	],
).enableRLS();

// ── Vorfälle ───────────────────────────────────────────────────────────────

export const incidents = pgTable(
	"incidents",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		awareAt: ts().notNull(),
		occurredAt: ts(),
		classifiedAt: ts(),
		regimes: json<(typeof INCIDENT_REGIMES)[number][]>()
			.notNull()
			.default(["dora"]),
		affectsPayments: boolean().notNull().default(false),
		doraCriteria: json<Record<string, unknown>>(),
		nis2Criteria: json<Record<string, unknown>>(),
		dsgvoCriteria: json<Record<string, unknown>>(),
		classification: text({
			enum: ["major", "significant", "minor", "unclassified"],
		})
			.notNull()
			.default("unclassified"),
		classificationOverrideNote: text(),
		earlyWarningAt: ts(),
		initialDueAt: ts(),
		intermediateDueAt: ts(),
		finalDueAt: ts(),
		initialReportedAt: ts(),
		intermediateReportedAt: ts(),
		finalReportedAt: ts(),
		rootCause: text(),
		status: text({ enum: ["open", "contained", "resolved", "closed"] })
			.notNull()
			.default("open"),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("incidents_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("incidents"),
	],
).enableRLS();

export const incidentUpdates = pgTable(
	"incident_updates",
	{
		id: pk(),
		organizationId: orgId(),
		incidentId: uuid()
			.notNull()
			.references(() => incidents.id, { onDelete: "cascade" }),
		authorUserId: userRef(),
		kind: text({
			enum: ["update", "report_sent", "status_change", "classification"],
		})
			.notNull()
			.default("update"),
		body: text().notNull(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("incident_updates_incident_idx").on(t.incidentId),
		orgPolicy("incident_updates"),
	],
).enableRLS();

export const lossEvents = pgTable(
	"loss_events",
	{
		id: pk(),
		organizationId: orgId(),
		occurredAt: date().notNull(),
		detectedAt: date(),
		amount: numeric({ precision: 18, scale: 2 }),
		currency: text().notNull().default("EUR"),
		recovery: numeric({ precision: 18, scale: 2 }),
		category: text().notNull(),
		cause: text(),
		description: text(),
		incidentId: uuid().references(() => incidents.id, { onDelete: "set null" }),
		riskId: uuid().references(() => risks.id, { onDelete: "set null" }),
		ownerUserId: userRef(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("loss_events_org_idx").on(t.organizationId),
		orgPolicy("loss_events"),
	],
).enableRLS();

// ── Meilensteine ───────────────────────────────────────────────────────────

export const milestones = pgTable(
	"milestones",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		description: text(),
		phase: text(),
		status: text({ enum: ["todo", "doing", "done"] })
			.notNull()
			.default("todo"),
		dueAt: date(),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		sortOrder: integer().notNull().default(0),
		...timestamps(),
	},
	(t) => [
		index("milestones_org_idx").on(t.organizationId),
		orgPolicy("milestones"),
	],
).enableRLS();

export const milestoneControls = pgTable(
	"milestone_controls",
	{
		id: pk(),
		organizationId: orgId(),
		milestoneId: uuid()
			.notNull()
			.references(() => milestones.id, { onDelete: "cascade" }),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
	},
	(t) => [
		unique().on(t.milestoneId, t.controlId),
		orgPolicy("milestone_controls"),
	],
).enableRLS();

// ── Schulung ───────────────────────────────────────────────────────────────

export const trainings = pgTable(
	"trainings",
	{
		id: pk(),
		organizationId: orgId(),
		title: text().notNull(),
		heldAt: date().notNull(),
		trainerUserId: userRef(),
		externalTrainer: text(),
		attendeeUserIds: stringList(),
		audience: text({ enum: ["all", "management", "role_specific"] })
			.notNull()
			.default("all"),
		evidenceId: uuid().references(() => evidence.id, { onDelete: "set null" }),
		notes: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("trainings_org_idx").on(t.organizationId),
		orgPolicy("trainings"),
	],
).enableRLS();

export const trainingRequirements = pgTable(
	"training_requirements",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		title: text().notNull(),
		description: text(),
		function: text({ enum: ROLE_FUNCTIONS }),
		orgRole: text(),
		frequencyMonths: integer().notNull().default(12),
		legalBasis: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		orgPolicy("training_requirements"),
	],
).enableRLS();

export const trainingAssignments = pgTable(
	"training_assignments",
	{
		id: pk(),
		organizationId: orgId(),
		requirementId: uuid()
			.notNull()
			.references(() => trainingRequirements.id, { onDelete: "cascade" }),
		userId: uuid().notNull(),
		dueAt: date().notNull(),
		completedAt: date(),
		trainingId: uuid().references(() => trainings.id, { onDelete: "set null" }),
		status: text({ enum: ["due", "overdue", "done"] })
			.notNull()
			.default("due"),
	},
	(t) => [
		index("training_assignments_user_idx").on(t.userId, t.status),
		orgPolicy("training_assignments"),
	],
).enableRLS();

export type ControlImplementation = typeof controlImplementations.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Risk = typeof risks.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type Resolution = typeof resolutions.$inferSelect;
