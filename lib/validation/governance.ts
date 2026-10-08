import { z } from "zod";
import {
	CRITICALITY,
	ENTITY_KINDS,
	NC_PRIORITIES,
	ROLE_FUNCTIONS,
} from "@/db/schema/enums";
import { NONCONFORMITY_STATUSES } from "@/lib/entities/nonconformity";
import { PROCESS_STATUSES } from "@/lib/entities/process";
import { longText, shortText, uuid } from "./common";

const isoDate = z.iso.date();
const optionalDate = isoDate.nullable().optional();
const hours = z.coerce.number().int().min(0).max(100_000).nullable().optional();

// ── Prozesse ───────────────────────────────────────────────────────────────
export const processSchema = z.object({
	processId: uuid.optional(),
	code: z
		.string()
		.trim()
		.regex(/^P-\d{2,3}$/, "Format P-NN")
		.optional(),
	name: shortText,
	description: longText.optional(),
	category: z
		.enum(["core", "support", "management", "control"])
		.default("core"),
	criticality: z.enum(CRITICALITY).default("standard"),
	ownerUserId: uuid.nullable().optional(),
	deputyUserId: uuid.nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
	rtoHours: hours,
	rpoHours: hours,
	mtpdHours: hours,
	impactNotes: longText.optional(),
	inputs: longText.optional(),
	outputs: longText.optional(),
	parentProcessId: uuid.nullable().optional(),
	reviewAt: optionalDate,
});
export type ProcessInput = z.output<typeof processSchema>;

export const raciEntrySchema = z
	.object({
		userId: uuid.nullable().optional(),
		function: z.enum(ROLE_FUNCTIONS).nullable().optional(),
		raci: z.enum(["R", "A", "C", "I"]),
	})
	.refine((e) => Boolean(e.userId) !== Boolean(e.function), {
		message: "Entweder Person oder Funktion",
	});

export const setProcessRaciSchema = z.object({
	processId: uuid,
	entries: z.array(raciEntrySchema).max(30),
});

export const setProcessLinksSchema = z.object({
	processId: uuid,
	controlCodes: z.array(z.string().min(1)).max(60).optional(),
	assetIds: z.array(uuid).max(100).optional(),
	providerIds: z.array(uuid).max(100).optional(),
	riskIds: z.array(uuid).max(100).optional(),
	documentIds: z.array(uuid).max(100).optional(),
});

export const setProcessStatusSchema = z.object({
	processId: uuid,
	status: z.enum(PROCESS_STATUSES),
	note: z.string().trim().max(2000).optional(),
});

export const applyProcessSeedSchema = z.object({
	codes: z.array(z.string().min(1)).max(60).optional(),
});

// ── Organisation: Kontext, Parteien, Geltungsbereich ───────────────────────
export const contextIssueSchema = z.object({
	id: uuid.optional(),
	scope: z.enum(["internal", "external"]).default("internal"),
	title: shortText,
	description: longText.optional(),
	impact: longText.optional(),
	relatedRiskId: uuid.nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
	reviewAt: optionalDate,
});

export const PARTY_TYPES = [
	"regulator",
	"customer",
	"employee",
	"supplier",
	"shareholder",
	"partner",
	"public",
	"community",
] as const;

export const interestedPartySchema = z.object({
	id: uuid.optional(),
	name: shortText,
	type: z.enum(PARTY_TYPES).default("regulator"),
	expectations: longText.optional(),
	requirements: longText.optional(),
	relevantFrameworks: z.array(z.string().max(40)).max(20).optional(),
	howAddressed: longText.optional(),
	contact: z.string().max(400).optional(),
	ownerUserId: uuid.nullable().optional(),
	reviewAt: optionalDate,
});

export const scopeSchema = z.object({
	id: uuid.optional(),
	frameworkSlug: z.string().max(40).nullable().optional(),
	statement: longText.min(10),
	boundaries: longText.optional(),
	locations: z.array(z.string().max(120)).max(30).optional(),
	services: z.array(z.string().max(120)).max(30).optional(),
	exclusions: z
		.array(z.object({ what: shortText, justification: longText.min(3) }))
		.max(30)
		.optional(),
	version: z.string().max(20).optional(),
	ownerUserId: uuid.nullable().optional(),
});

export const requestScopeApprovalSchema = z.object({
	scopeId: uuid,
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

// ── Rollen & Leitung ───────────────────────────────────────────────────────
export const fitProperChecklistSchema = z.object({
	cv: z.boolean().default(false),
	criminalRecord: z.boolean().default(false), // Führungszeugnis < 3 Monate
	gzr: z.boolean().default(false), // Gewerbezentralregister
	debtorRegister: z.boolean().default(false), // Schuldnerverzeichnis
	declarations: z.boolean().default(false), // Erklärungen (Zuverlässigkeit, Insolvenz)
	timeBudget: z.boolean().default(false),
	conflicts: z.boolean().default(false), // Interessenkonflikte offengelegt
	note: z.string().max(2000).optional(),
});
export type FitProperChecklist = z.output<typeof fitProperChecklistSchema>;

export const roleAssignmentSchema = z
	.object({
		id: uuid.optional(),
		function: z.enum(ROLE_FUNCTIONS),
		userId: uuid.nullable().optional(),
		externalName: z.string().trim().max(200).nullable().optional(),
		appointedAt: optionalDate,
		deputyUserId: uuid.nullable().optional(),
		evidenceId: uuid.nullable().optional(),
		fitProperStatus: z
			.enum(["not_required", "pending", "confirmed", "rejected"])
			.default("not_required"),
		fitProperChecklist: fitProperChecklistSchema.nullable().optional(),
		documentsValidUntil: optionalDate,
		reviewAt: optionalDate,
	})
	.refine((r) => Boolean(r.userId) || Boolean(r.externalName?.trim()), {
		message: "Person oder externer Name erforderlich",
		path: ["userId"],
	});

// ── Ziele & KPIs ───────────────────────────────────────────────────────────
export const objectiveSchema = z.object({
	id: uuid.optional(),
	title: shortText,
	frameworkIds: z.array(z.string().max(40)).max(20).optional(),
	kpiName: z.string().max(120).optional(),
	unit: z.string().max(30).optional(),
	target: z.string().max(60).optional(),
	dueAt: optionalDate,
	ownerUserId: uuid.nullable().optional(),
	status: z
		.enum(["open", "on_track", "at_risk", "achieved", "dropped"])
		.default("open"),
});

export const kpiMeasurementSchema = z.object({
	objectiveId: uuid,
	measuredAt: isoDate,
	value: z.string().trim().min(1).max(60),
	note: z.string().max(400).optional(),
});

// ── Kommunikation, Aufsicht, Interessenkonflikte ───────────────────────────
export const communicationSchema = z.object({
	id: uuid.optional(),
	topic: shortText,
	interestedPartyId: uuid.nullable().optional(),
	audience: z.string().max(200).optional(),
	purpose: longText.optional(),
	channel: z.string().max(200).optional(),
	frequency: z.string().max(80).optional(),
	trigger: z
		.enum(["regular", "incident", "crisis", "change"])
		.default("regular"),
	ownerFunction: z.enum(ROLE_FUNCTIONS).nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
	templateDocumentId: uuid.nullable().optional(),
	legalBasis: z.string().max(200).optional(),
	obligationCode: z.string().max(60).nullable().optional(),
	contact: z.string().max(400).optional(),
});

export const AUTHORITIES = [
	"bafin",
	"bundesbank",
	"bsi",
	"fiu",
	"dsb",
	"esma",
	"eba",
	"other",
] as const;

export const regulatorInteractionSchema = z.object({
	id: uuid.optional(),
	authority: z.enum(AUTHORITIES).default("bafin"),
	date: isoDate,
	subject: shortText,
	direction: z.enum(["inbound", "outbound"]).default("inbound"),
	deadline: optionalDate,
	responseAt: optionalDate,
	ownerUserId: uuid.nullable().optional(),
	evidenceId: uuid.nullable().optional(),
	notes: longText.optional(),
	status: z.enum(["open", "answered", "closed"]).default("open"),
});

export const conflictSchema = z.object({
	id: uuid.optional(),
	title: shortText,
	type: z.string().max(80).optional(),
	partiesInvolved: z.string().max(400).optional(),
	description: longText.optional(),
	mitigation: longText.optional(),
	disclosedAt: optionalDate,
	ownerUserId: uuid.nullable().optional(),
	reviewAt: optionalDate,
	status: z.enum(["open", "mitigated", "closed"]).default("open"),
});

export const deleteByIdSchema = z.object({ id: uuid });

// ── Beschlüsse ─────────────────────────────────────────────────────────────
export const resolutionSchema = z.object({
	subject: shortText,
	decisionText: longText.min(5),
	body: z
		.enum(["management", "supervisory", "shareholders"])
		.default("management"),
	date: isoDate,
	legalBasis: z.string().max(300).optional(),
	requiredCode: z.string().max(60).nullable().optional(),
	linkedEntityType: z.enum(ENTITY_KINDS).nullable().optional(),
	linkedEntityId: uuid.nullable().optional(),
	attendeeUserIds: z.array(uuid).max(50).optional(),
	minutesEvidenceId: uuid.nullable().optional(),
	requestApproval: z.boolean().default(true),
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

// ── Audits ─────────────────────────────────────────────────────────────────
export const auditProgrammeSchema = z.object({
	id: uuid.optional(),
	title: shortText,
	cycleStart: isoDate,
	cycleYears: z.coerce.number().int().min(1).max(5).default(3),
});

export const auditProgrammeItemSchema = z.object({
	programmeId: uuid,
	scopeType: z.enum(["domain", "process", "control", "provider", "framework"]),
	scopeRef: z.string().min(1).max(120),
	plannedYear: z.coerce.number().int().min(2020).max(2100),
	riskRating: z.enum(["low", "medium", "high"]).default("medium"),
	frequencyYears: z.coerce.number().int().min(1).max(5).default(3),
});

export const removeProgrammeItemSchema = z.object({ id: uuid });

export const AUDIT_TYPES = [
	"internal",
	"external",
	"certification",
	"regulator",
] as const;
export const AUDIT_STATUSES = [
	"planned",
	"in_progress",
	"reported",
	"closed",
] as const;

export const auditSchema = z.object({
	id: uuid.optional(),
	programmeId: uuid.nullable().optional(),
	type: z.enum(AUDIT_TYPES).default("internal"),
	title: shortText,
	scope: longText.optional(),
	periodStart: optionalDate,
	periodEnd: optionalDate,
	frameworkIds: z.array(z.string().max(40)).max(20).optional(),
	auditorMemberIds: z.array(uuid).max(20).optional(),
	externalAuditor: z.string().max(200).optional(),
	plannedAt: optionalDate,
	performedAt: optionalDate,
	ownerUserId: uuid.nullable().optional(),
	reportEvidenceId: uuid.nullable().optional(),
});

export const setAuditStatusSchema = z.object({
	auditId: uuid,
	status: z.enum(AUDIT_STATUSES),
});

export const FINDING_SEVERITIES = [
	"observation",
	"minor",
	"major",
	"critical",
] as const;
export const FINDING_STATUSES = [
	"open",
	"accepted",
	"in_remediation",
	"closed",
] as const;

export const auditFindingSchema = z.object({
	auditId: uuid,
	severity: z.enum(FINDING_SEVERITIES).default("minor"),
	title: shortText,
	description: longText.optional(),
	controlCode: z.string().max(20).nullable().optional(),
	requirementKey: z.string().max(60).nullable().optional(),
});

export const findingStatusSchema = z.object({
	findingId: uuid,
	status: z.enum(FINDING_STATUSES),
});

export const findingToNonconformitySchema = z.object({ findingId: uuid });

export const auditRequestSchema = z.object({
	auditId: uuid,
	title: shortText,
	description: longText.optional(),
	controlCode: z.string().max(20).nullable().optional(),
	requirementKey: z.string().max(60).nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
	dueAt: optionalDate,
});

export const respondAuditRequestSchema = z.object({
	requestId: uuid,
	responseNote: longText.min(1),
	responseEvidenceIds: z.array(uuid).max(20).optional(),
});

export const decideAuditRequestSchema = z.object({
	requestId: uuid,
	decision: z.enum(["accepted", "rejected"]),
	note: z.string().max(2000).optional(),
});

// ── Abweichungen (CAPA) ────────────────────────────────────────────────────
export const NC_SOURCES = [
	"audit",
	"incident",
	"control_test",
	"complaint",
	"management_review",
	"self_identified",
] as const;

export const nonconformitySchema = z.object({
	id: uuid.optional(),
	source: z.enum(NC_SOURCES).default("self_identified"),
	title: shortText,
	description: longText.optional(),
	rootCause: longText.optional(),
	correction: longText.optional(),
	correctiveAction: longText.optional(),
	ownerUserId: uuid.nullable().optional(),
	assigneeUserId: uuid.nullable().optional(),
	dueAt: optionalDate,
	effectivenessCheckAt: optionalDate,
});

export const nonconformityPrioritySchema = z.object({
	nonconformityId: uuid,
	priority: z.enum(NC_PRIORITIES).nullable(),
	note: z.string().trim().max(2000).optional(),
});

export const setNonconformityStatusSchema = z.object({
	nonconformityId: uuid,
	status: z.enum(NONCONFORMITY_STATUSES),
	note: z.string().trim().max(2000).optional(),
});

export const effectivenessSchema = z.object({
	nonconformityId: uuid,
	result: z.enum(["effective", "partially", "ineffective"]),
	note: z.string().trim().max(2000).optional(),
});

// ── Managementbewertung ────────────────────────────────────────────────────
export const managementReviewSchema = z.object({
	id: uuid.optional(),
	heldAt: isoDate,
	attendeeUserIds: z.array(uuid).max(50).optional(),
	summary: longText.optional(),
	decisions: longText.optional(),
	ownerUserId: uuid.nullable().optional(),
	minutesEvidenceId: uuid.nullable().optional(),
});

export const reviewInputsSchema = z.object({
	reviewId: uuid,
	inputs: z.record(
		z.string().max(60),
		z.object({ done: z.boolean(), note: z.string().max(2000).optional() }),
	),
});

export const completeReviewSchema = z.object({
	reviewId: uuid,
	status: z.enum(["planned", "held", "done"]),
	// Ergebnisse der Bewertung: Aufgabe (Maßnahme), Beschluss (ins
	// Beschlussregister mit Freigabe) oder Abweichung (CAPA, ISO 27001 10.2).
	actions: z
		.array(
			z.object({
				kind: z.enum(["task", "resolution", "nonconformity"]).default("task"),
				title: shortText,
				text: z.string().trim().max(5000).optional(),
				assigneeUserId: uuid.nullable().optional(),
				dueAt: optionalDate,
			}),
		)
		.max(30)
		.optional(),
});

// ── Prüfer-Zugang ──────────────────────────────────────────────────────────
export const ACCESS_GRANTS = [
	"aml_detail",
	"hr_detail",
	"whistleblowing_detail",
	"complaints_detail",
] as const;

export const memberAccessSchema = z.object({
	memberId: uuid,
	accessUntil: z.coerce.date().nullable(),
	grants: z.array(z.enum(ACCESS_GRANTS)).max(10).default([]),
});

// ── Pflichten-Kalender ─────────────────────────────────────────────────────
export const completeRunSchema = z.object({
	runId: uuid,
	evidenceId: uuid.nullable().optional(),
	note: z.string().max(2000).optional(),
});

export const waiveRunSchema = z.object({
	runId: uuid,
	note: z.string().trim().min(3).max(2000),
});

export const updateObligationSchema = z.object({
	obligationId: uuid,
	ownerUserId: uuid.nullable().optional(),
	leadDays: z.coerce.number().int().min(0).max(365).optional(),
	active: z.boolean().optional(),
});

// ── Testprogramm ───────────────────────────────────────────────────────────
export const planTestSchema = z.object({
	implementationId: uuid,
	method: z.enum([
		"interview",
		"inspection",
		"reperformance",
		"automated",
		"vuln_scan",
		"pentest",
		"bcm_exercise",
		"tlpt",
		"access_review",
	]),
	plannedAt: isoDate,
	scope: z.string().max(400).optional(),
	processId: uuid.nullable().optional(),
	assetId: uuid.nullable().optional(),
});

// ── Beschwerden & Hinweise ─────────────────────────────────────────────────
export const complaintSchema = z.object({
	id: uuid.optional(),
	receivedAt: z.coerce.date(),
	channel: z.string().max(80).optional(),
	category: z.string().max(120).optional(),
	description: longText.optional(),
	// Pseudonym/Referenz — wird feldverschlüsselt
	complainantRef: z.string().max(200).nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
	outcome: longText.optional(),
	escalatedToRegulator: z.boolean().optional(),
});

export const complaintTransitionSchema = z.object({
	id: uuid,
	to: z.enum(["acknowledged", "resolved", "closed", "open"]),
	note: z.string().max(2000).optional(),
});

export const whistleblowingSchema = z.object({
	id: uuid.optional(),
	receivedAt: z.coerce.date(),
	channel: z.string().max(80).optional(),
	category: z.string().max(120).optional(),
	// Zusammenfassung — feldverschlüsselt; keine Identitätsdaten
	summary: z.string().max(5000).nullable().optional(),
	ownerFunction: z.enum(ROLE_FUNCTIONS).default("compliance"),
});

export const whistleblowingTransitionSchema = z.object({
	id: uuid,
	to: z.enum(["acknowledged", "in_review", "closed", "received"]),
});
