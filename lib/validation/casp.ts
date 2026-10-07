import { z } from "zod";
import { longText, shortText, uuid } from "./common";

// Validierung für die CASP-/AML-Module (P4): AML-Risikoanalyse, Monitoring-
// Regelwerk, Verdachtsmeldungen/STOR, Länder & Korridore, Eigenmittel,
// Kryptowerte, Gesellschafter. Server re-parsed immer.

const isoDate = z.iso.date();
const optionalDate = isoDate.nullable().optional();
const money = z.coerce.number().min(0).max(1e13);
const optionalMoney = money.nullable().optional();
const score = z.coerce.number().int().min(1).max(5);

// ── AML-Risikoanalyse (§ 5 GwG / AMLR Art. 10) ─────────────────────────────
const dimensionSchema = z.object({
	factors: z.string().trim().max(4000).default(""),
	score: score.default(3),
	measures: z.string().trim().max(4000).optional(),
});

export const amlRiskAnalysisSchema = z.object({
	id: uuid.optional(),
	version: z.string().trim().max(20).optional(),
	dimensions: z.object({
		customer: dimensionSchema,
		product: dimensionSchema,
		country: dimensionSchema,
		channel: dimensionSchema,
	}),
	summary: longText.optional(),
	ownerUserId: uuid.nullable().optional(),
	nextReviewAt: optionalDate,
});
export type AmlRiskAnalysisInput = z.output<typeof amlRiskAnalysisSchema>;

export const requestAmlApprovalSchema = z.object({
	id: uuid,
	selfApprovalReason: z.string().trim().min(3).max(2000).optional(),
});

// ── Monitoring-Regelwerk ───────────────────────────────────────────────────
export const MONITORING_RULE_STATUSES = [
	"active",
	"paused",
	"retired",
] as const;

export const monitoringRuleSchema = z.object({
	id: uuid.optional(),
	code: z
		.string()
		.trim()
		.regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "Format TM-01"),
	description: shortText.max(500),
	threshold: z.string().trim().max(200).optional(),
	rationale: longText.optional(),
	legalBasis: z.string().trim().max(200).optional(),
	ownerUserId: uuid.nullable().optional(),
	lastTunedAt: optionalDate,
	falsePositiveRate: z.coerce.number().min(0).max(100).nullable().optional(),
	status: z.enum(MONITORING_RULE_STATUSES).default("active"),
});

// ── Verdachtsmeldungen (§ 43 GwG) und STOR (Art. 92 MiCAR) ────────────────
export const SUSPICIOUS_KINDS = ["gwg_sar", "micar_stor"] as const;
export const SUSPICIOUS_STATUSES = ["review", "reported", "dismissed"] as const;

export const suspiciousReportSchema = z.object({
	id: uuid.optional(),
	kind: z.enum(SUSPICIOUS_KINDS).default("gwg_sar"),
	detectedAt: z.coerce.date(),
	category: z.string().trim().max(200).optional(),
	// feldverschlüsselt; keine Kunden-PII
	decisionNote: z.string().trim().max(8000).nullable().optional(),
	incidentId: uuid.nullable().optional(),
	ownerUserId: uuid.nullable().optional(),
});

export const suspiciousTransitionSchema = z.object({
	id: uuid,
	to: z.enum(SUSPICIOUS_STATUSES),
	externalRef: z.string().trim().max(120).optional(),
});

// ── Länder & Korridore ─────────────────────────────────────────────────────
export const FATF_STATUSES = ["none", "grey", "black"] as const;
export const ORG_STANCES = ["allowed", "enhanced_dd", "blocked"] as const;
export const CORRIDOR_STATUSES = [
	"none",
	"evaluating",
	"pilot",
	"active",
	"suspended",
] as const;

export const jurisdictionSchema = z.object({
	id: uuid.optional(),
	iso2: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/),
	name: shortText.max(120),
	euHighRisk: z.boolean().default(false),
	fatfStatus: z.enum(FATF_STATUSES).default("none"),
	euSanctions: z.boolean().default(false),
	usSanctions: z.boolean().default(false),
	orgStance: z.enum(ORG_STANCES).default("allowed"),
	corridorStatus: z.enum(CORRIDOR_STATUSES).default("none"),
	corridorNotes: longText.optional(),
	legalNotes: longText.optional(),
	reviewedAt: optionalDate,
});

export const jurisdictionCsvSchema = z.object({
	csv: z.string().min(5).max(200_000),
});

export const corridorTemplateSchema = z.object({
	iso2: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/),
	startDate: isoDate.optional(),
});

// ── Eigenmittel (MiCAR Art. 67, ZAG §§ 12, 15) ─────────────────────────────
export const ownFundsSchema = z.object({
	id: uuid.optional(),
	periodLabel: z.string().trim().min(2).max(20), // z. B. 2027-Q1
	micarClass: z.coerce.number().int().min(1).max(3).nullable().optional(),
	fixedOverheadsPrevYear: optionalMoney,
	zagMethod: z.enum(["A", "B", "C"]).nullable().optional(),
	zagServiceKind: z
		.enum(["money_remittance_only", "payment_initiation_only", "other"])
		.default("money_remittance_only"),
	monthlyPaymentVolume: optionalMoney,
	relevantIndicator: optionalMoney,
	availableOwnFunds: optionalMoney,
	// Risikotragfähigkeit (AT 4.1)
	liquidityBuffer: optionalMoney,
	riskAmounts: z
		.array(
			z.object({
				category: z.string().trim().min(1).max(60),
				amount: money,
			}),
		)
		.max(20)
		.optional(),
});
export type OwnFundsInputForm = z.input<typeof ownFundsSchema>;

export const requestOwnFundsApprovalSchema = z.object({
	id: uuid,
	selfApprovalReason: z.string().trim().min(3).max(2000).optional(),
});

// ── Kryptowerte (Art. 62(2)(r), Art. 48 ff. MiCAR) ────────────────────────
export const cryptoAssetSchema = z.object({
	id: uuid.optional(),
	symbol: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9-]{2,12}$/),
	name: shortText.max(120),
	issuer: z.string().trim().max(200).nullable().optional(),
	type: z.enum(["emt", "art", "native", "other"]).default("emt"),
	issuerAuthorisation: z.string().trim().max(400).nullable().optional(),
	whitepaperRef: z.string().trim().max(400).nullable().optional(),
	micarStatus: z
		.enum(["authorised", "not_authorised", "pending"])
		.default("pending"),
	networks: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
	accepted: z.boolean().default(false),
	acceptedFrom: optionalDate,
	perTxLimit: optionalMoney,
	reviewedAt: optionalDate,
	notes: longText.optional(),
});

// ── Gesellschafter (Art. 83–85 MiCAR, § 14 ZAG, InhKontrollV) ──────────────
export const shareholderSchema = z.object({
	id: uuid.optional(),
	name: shortText.max(200),
	isLegalPerson: z.boolean().default(false),
	sharePct: z.coerce.number().min(0).max(100).nullable().optional(),
	votingPct: z.coerce.number().min(0).max(100).nullable().optional(),
	// feldverschlüsselt
	uboChain: z.string().trim().max(8000).nullable().optional(),
	inhaberkontrolleStatus: z
		.enum(["not_required", "pending", "approved", "rejected"])
		.default("not_required"),
	notifiedAt: optionalDate,
	approvedAt: optionalDate,
	sanctionsCheckedAt: optionalDate,
});
