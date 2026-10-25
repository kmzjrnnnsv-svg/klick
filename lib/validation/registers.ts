import { z } from "zod";
import {
	CLASSIFICATIONS,
	CRITICALITY,
	INCIDENT_REGIMES,
	ROLE_FUNCTIONS,
} from "@/db/schema/enums";
import { DOCUMENT_TYPES, RISK_CATEGORIES } from "@/db/schema/grc";
import { PROVIDER_CATEGORIES, PROVIDER_STATUSES } from "@/db/schema/registers";
import { RISK_SOURCE_KINDS } from "@/lib/compliance/risk-sources";
import { INCIDENT_STATUSES } from "@/lib/entities/incident";
import { RISK_STATUSES } from "@/lib/entities/risk";
import { httpUrl, longText, shortText, uuid } from "./common";
import { responsibleRef } from "./responsible";

const scale = z.coerce.number().int().min(1).max(5);
const isoDate = z.iso.date();
const optionalDate = isoDate.nullable().optional();

// ── Risiken ────────────────────────────────────────────────────────────────
export const createRiskSchema = z.object({
	title: shortText,
	description: longText.optional(),
	category: z.enum(RISK_CATEGORIES).default("operational"),
	likelihood: scale.default(3),
	impact: scale.default(3),
	ownerUserId: responsibleRef,
});
export type CreateRiskInput = z.output<typeof createRiskSchema>;

export const updateRiskSchema = z.object({
	riskId: uuid,
	title: shortText.optional(),
	description: longText.nullable().optional(),
	category: z.enum(RISK_CATEGORIES).optional(),
	likelihood: scale.optional(),
	impact: scale.optional(),
	treatment: z.enum(["mitigate", "accept", "transfer", "avoid"]).optional(),
	residualLikelihood: scale.nullable().optional(),
	residualImpact: scale.nullable().optional(),
	ownerUserId: responsibleRef,
	assigneeUserId: uuid.nullable().optional(),
	reviewAt: optionalDate,
	controlCodes: z.array(z.string().min(1)).max(50).optional(),
	assetIds: z.array(uuid).max(50).optional(),
});

export const setRiskStatusSchema = z.object({
	riskId: uuid,
	status: z.enum(RISK_STATUSES),
	note: z.string().trim().max(2000).optional(),
	// Solo-Modus
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

export const createTreatmentSchema = z.object({
	riskId: uuid,
	title: shortText,
	description: longText.optional(),
	ownerUserId: uuid.nullable().optional(),
	dueAt: optionalDate,
	costEur: z.coerce
		.number()
		.int()
		.min(0)
		.max(1_000_000_000)
		.nullable()
		.optional(),
});

// Risiko-Assistent (/risiken/neu, /risiken/[id]/bewerten): eine Anlage bzw.
// Neubewertung in einem Schritt. impact rechnet der Server aus impactDetail.
export const guidedRiskSchema = z
	.object({
		riskId: uuid.optional(),
		scenarioCode: z.string().trim().max(20).nullable().optional(),
		title: shortText,
		category: z.enum(RISK_CATEGORIES),
		impactDescription: longText.optional(),
		existingMeasures: longText.optional(),
		protectionGoals: z
			.array(
				z.enum([
					"confidentiality",
					"integrity",
					"availability",
					"authenticity",
				]),
			)
			.max(4)
			.default([]),
		controlCodes: z.array(z.string().min(1).max(20)).max(50).default([]),
		assetIds: z.array(uuid).max(50).default([]),
		processIds: z.array(uuid).max(50).default([]),
		providerId: uuid.nullable().optional(),
		// Herkunft (B1): geprüft gegen die Org in saveGuided
		sourceEntityType: z.enum(RISK_SOURCE_KINDS).nullable().optional(),
		sourceEntityId: uuid.nullable().optional(),
		impactDetail: z
			.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/), scale)
			.refine((o) => Object.keys(o).length > 0 && Object.keys(o).length <= 15, {
				message: "Mindestens eine Schadensart bewerten.",
			}),
		likelihood: scale,
		treatment: z.enum(["mitigate", "accept", "transfer", "avoid"]),
		treatmentNote: longText.optional(),
		measures: z
			.array(
				z.object({
					title: shortText,
					ownerUserId: uuid.nullable().optional(),
					dueAt: optionalDate,
					costEur: z.coerce
						.number()
						.int()
						.min(0)
						.max(1_000_000_000)
						.nullable()
						.optional(),
				}),
			)
			.max(20)
			.default([]),
		residualLikelihood: scale.nullable().optional(),
		residualImpact: scale.nullable().optional(),
		residualNote: longText.optional(),
		ownerUserId: responsibleRef,
		reviewAt: optionalDate,
		selfApprovalReason: z.string().trim().max(2000).optional(),
	})
	.refine(
		(d) => (d.residualLikelihood == null) === (d.residualImpact == null),
		{
			message: "Restrisiko: Wahrscheinlichkeit und Schaden zusammen angeben.",
			path: ["residualImpact"],
		},
	);
export type GuidedRiskInput = z.output<typeof guidedRiskSchema>;

export const createExceptionSchema = z.object({
	title: shortText,
	controlCode: z.string().min(1).optional(),
	documentId: uuid.optional(),
	justification: longText.min(10),
	compensatingControls: longText.optional(),
	riskId: uuid.optional(),
	validUntil: isoDate,
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

export const createLossEventSchema = z.object({
	occurredAt: isoDate,
	detectedAt: optionalDate,
	amount: z.coerce.number().min(0).optional(),
	recovery: z.coerce.number().min(0).optional(),
	category: shortText,
	cause: longText.optional(),
	description: longText.optional(),
	incidentId: uuid.optional(),
	riskId: uuid.optional(),
});

// ── Dokumente ──────────────────────────────────────────────────────────────
export const createDocumentSchema = z.object({
	title: shortText,
	type: z.enum(DOCUMENT_TYPES).default("policy"),
	domain: z.string().max(40).optional(),
	classification: z.enum(CLASSIFICATIONS).default("internal"),
	ownerUserId: responsibleRef,
	approverFunction: z.string().max(40).optional(),
	bodyMarkdown: z.string().max(200_000).optional(),
	templateCode: z.string().max(60).optional(),
	reviewCycleMonths: z.coerce.number().int().min(1).max(60).default(12),
	controlCodes: z.array(z.string().min(1)).max(50).optional(),
	distribution: z.array(z.string().max(40)).max(20).optional(),
	retentionYears: z.coerce.number().int().min(0).max(30).nullable().optional(),
});
export type CreateDocumentInput = z.output<typeof createDocumentSchema>;

export const updateDocumentSchema = z.object({
	documentId: uuid,
	title: shortText.optional(),
	domain: z.string().max(40).nullable().optional(),
	classification: z.enum(CLASSIFICATIONS).optional(),
	ownerUserId: responsibleRef,
	assigneeUserId: uuid.nullable().optional(),
	approverFunction: z.string().max(40).nullable().optional(),
	bodyMarkdown: z.string().max(200_000).nullable().optional(),
	reviewCycleMonths: z.coerce.number().int().min(1).max(60).optional(),
	controlCodes: z.array(z.string().min(1)).max(50).optional(),
	distribution: z.array(z.string().max(40)).max(20).optional(),
	retentionYears: z.coerce.number().int().min(0).max(30).nullable().optional(),
});

export const newDocumentVersionSchema = z.object({
	documentId: uuid,
	changeSummary: z.string().trim().min(3).max(2000),
	bodyMarkdown: z.string().max(200_000).optional(),
	fileEvidenceId: uuid.optional(),
	bump: z.enum(["minor", "major"]).default("minor"),
});

export const documentTransitionSchema = z.object({
	documentId: uuid,
	to: z.enum(["in_review", "approved", "published", "retired", "draft"]),
	note: z.string().trim().max(2000).optional(),
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

export const acknowledgeSchema = z.object({ documentId: uuid });

export const applyTemplatesSchema = z.object({
	codes: z.array(z.string().min(1)).min(1).max(60),
});

// ── Vorfälle ───────────────────────────────────────────────────────────────
export const createIncidentSchema = z.object({
	title: shortText,
	awareAt: z.coerce.date(),
	affectsPayments: z.boolean().default(false),
	affectsCustomers: z.boolean().default(false),
	description: longText.optional(),
	regimes: z.array(z.enum(INCIDENT_REGIMES)).min(1).default(["dora"]),
	productId: uuid.nullable().optional(),
});
export type CreateIncidentInput = z.output<typeof createIncidentSchema>;

export const classifyIncidentSchema = z.object({
	incidentId: uuid,
	regimes: z.array(z.enum(INCIDENT_REGIMES)).min(1),
	affectsPayments: z.boolean().default(false),
	doraCriteria: z
		.object({
			criticalServicesAffected: z.boolean().optional(),
			maliciousAccess: z.boolean().optional(),
			clientsAffected: z.coerce.number().min(0).optional(),
			clientsAffectedPct: z.coerce.number().min(0).max(100).optional(),
			durationHours: z.coerce.number().min(0).optional(),
			downtimeHours: z.coerce.number().min(0).optional(),
			geographicSpread: z.boolean().optional(),
			dataLoss: z.boolean().optional(),
			reputationalImpact: z.boolean().optional(),
			economicImpactEur: z.coerce.number().min(0).optional(),
		})
		.optional(),
	nis2Criteria: z
		.object({
			severeOperationalDisruption: z.boolean().optional(),
			financialLoss: z.boolean().optional(),
			affectsOthers: z.boolean().optional(),
		})
		.optional(),
	// CRA Art. 14: aktiv ausgenutzt (Schwachstelle) bzw. schwerwiegend (Vorfall)
	craCriteria: z
		.object({
			activelyExploited: z.boolean().optional(),
			affectsAvailabilityOrIntegrity: z.boolean().optional(),
			maliciousCode: z.boolean().optional(),
		})
		.optional(),
	productId: uuid.nullable().optional(),
	classificationOverride: z.enum(["major", "significant", "minor"]).optional(),
	classificationOverrideNote: z.string().trim().max(2000).optional(),
});

export const incidentMitigationSchema = z.object({
	incidentId: uuid,
	// Zeitpunkt, ab dem eine Korrektur oder Abhilfe verfügbar ist (Default jetzt)
	at: z.coerce.date().optional(),
});

export const incidentReportSchema = z.object({
	incidentId: uuid,
	report: z.enum(["initial", "intermediate", "final"]),
	note: z.string().trim().max(4000).optional(),
});

export const incidentUpdateSchema = z.object({
	incidentId: uuid,
	body: z.string().trim().min(1).max(10_000),
	rootCause: z.string().trim().max(4000).optional(),
});

export const setIncidentStatusSchema = z.object({
	incidentId: uuid,
	status: z.enum(INCIDENT_STATUSES),
	note: z.string().trim().max(2000).optional(),
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

// ── Dienstleister & Assets ─────────────────────────────────────────────────
export const providerSchema = z.object({
	providerId: uuid.optional(),
	name: shortText,
	partnerType: z
		.enum([
			"ict",
			"outsourcing",
			"licence_partner",
			"bank",
			"issuer",
			"exchange",
			"custodian",
			"distribution",
		])
		.default("ict"),
	serviceType: z
		.enum([
			"cloud_iaas",
			"cloud_paas",
			"cloud_saas",
			"hosting",
			"network",
			"software",
			"security",
			"payment",
			"data",
			"other",
		])
		.optional(),
	serviceDescription: longText.optional(),
	category: z.enum(PROVIDER_CATEGORIES).nullable().optional(),
	status: z.enum(PROVIDER_STATUSES).optional(),
	criticality: z.enum(CRITICALITY).default("standard"),
	isIct: z.boolean().default(true),
	isOutsourcing: z.boolean().default(false),
	isMaterial: z.boolean().default(false),
	country: z.string().max(2).optional(),
	dataLocations: z.array(z.string().max(60)).max(20).optional(),
	processesPersonalData: z.boolean().default(false),
	contractRef: z.string().max(120).optional(),
	contractStart: optionalDate,
	contractEnd: optionalDate,
	noticePeriodDays: z.coerce
		.number()
		.int()
		.min(0)
		.max(3650)
		.nullable()
		.optional(),
	ownerUserId: responsibleRef,
	notes: longText.optional(),
});

export const retireAssetSchema = z.object({
	assetId: z.uuid(),
	note: z.string().trim().max(500).optional(),
});

export const assetSchema = z.object({
	assetId: uuid.optional(),
	name: shortText,
	type: z
		.enum([
			"system",
			"application",
			"data",
			"service",
			"device",
			"facility",
			"key_material",
			"hsm",
		])
		.default("system"),
	classification: z.enum(CLASSIFICATIONS).default("internal"),
	providerId: uuid.nullable().optional(),
	siteId: uuid.nullable().optional(),
	ownerUserId: responsibleRef,
	location: z.string().max(120).optional(),
	description: longText.optional(),
	isLegacy: z.boolean().default(false),
	custodian: z.string().max(120).optional(),
	backupLocation: z.string().max(120).optional(),
	rotationDue: optionalDate,
	// Lebenszyklus (B2)
	vendor: z.string().trim().max(120).optional(),
	product: z.string().trim().max(120).optional(),
	version: z.string().trim().max(60).optional(),
	endOfLifeAt: optionalDate,
	supportEndAt: optionalDate,
	maintenance: z.enum(["contract", "internal", "none"]).nullable().optional(),
	maintenanceUntil: optionalDate,
	lastPatchedAt: optionalDate,
});

// ── Schulungen ─────────────────────────────────────────────────────────────
export const trainingSchema = z.object({
	title: shortText,
	heldAt: isoDate,
	trainerUserId: uuid.nullable().optional(),
	externalTrainer: z.string().max(120).optional(),
	attendeeUserIds: z.array(uuid).max(500),
	audience: z.enum(["all", "management", "role_specific"]).default("all"),
	requirementCode: z.string().max(60).optional(),
	notes: longText.optional(),
});

export const TRAINING_ORG_ROLES = [
	"all",
	"owner",
	"editor",
	"viewer",
	"auditor",
] as const;

export const trainingRequirementSchema = z.object({
	id: uuid.optional(),
	title: shortText,
	description: z.string().trim().max(2000).nullable().optional(),
	courseUrl: httpUrl
		.nullable()
		.optional()
		.or(z.literal("").transform(() => null)),
	frequencyMonths: z.coerce.number().int().min(1).max(60).default(12),
	function: z.enum(ROLE_FUNCTIONS).nullable().optional(),
	orgRole: z.enum(TRAINING_ORG_ROLES).nullable().optional(),
	legalBasis: z.string().trim().max(300).nullable().optional(),
});

export const assignTrainingSchema = z.object({
	requirementId: uuid,
	userIds: z.array(uuid).min(1).max(500),
	dueAt: isoDate,
});

export const completeTrainingSchema = z.object({
	assignmentId: uuid,
	note: z.string().trim().max(2000).optional(),
});

// ── Wirksamkeitstests ──────────────────────────────────────────────────────
export const controlTestSchema = z.object({
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
	scope: z.string().max(400).optional(),
	testedAt: z.coerce.date().optional(),
	result: z.enum(["pass", "partial", "fail"]).optional(),
	notes: longText.optional(),
	nextTestAt: optionalDate,
});

// ── Freigaben ──────────────────────────────────────────────────────────────
export const decideApprovalSchema = z.object({
	requestId: uuid,
	decision: z.enum(["approved", "rejected", "changes_requested"]),
	note: z.string().trim().max(2000).optional(),
	// Managementanfrage: gewählte Option (eine der Optionen der Anfrage)
	chosenOption: z.string().trim().min(1).max(300).optional(),
});

export const delegationSchema = z.object({
	toUserId: uuid,
	validUntil: z.coerce.date(),
});

export const applyBundleSchema = z.object({
	code: z.string().min(1),
	entityType: z.string().optional(),
	entityId: uuid.optional(),
	startDate: isoDate.optional(),
});
