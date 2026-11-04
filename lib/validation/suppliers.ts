import { z } from "zod";
import { ASSESSMENT_ANSWERS } from "@/db/schema/enums";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { email, shortText, uuid } from "./common";
import { responsibleRef } from "./responsible";

// Lieferantenbewertung (S6): interne Steuerung und Portal-Eingaben.

const code = z.string().min(1).max(60);
const isoDate = z.iso.date();

export const startSupplierAssessmentSchema = z.object({
	providerId: uuid,
	templateCode: z.enum(["nis2-sw", "cra-sw", "dora-ikt"]),
	contactName: z.string().trim().max(200).optional(),
	contactEmail: email.optional().or(z.literal("").transform(() => undefined)),
	dueAt: isoDate.nullable().optional(),
});

export const portalLinkSchema = z.object({
	assessmentId: uuid,
	expiresInDays: z.number().int().min(1).max(60).default(30),
	sendMail: z.boolean().optional(),
});

export const completeSupplierAssessmentSchema = z
	.object({
		assessmentId: uuid,
		decision: z.enum(["accept", "accept_with_conditions", "reject"]),
		decisionNote: z.string().trim().max(4000).optional(),
	})
	.refine(
		(v) => v.decision === "accept" || (v.decisionNote ?? "").length >= 10,
		{
			message: "Begründung (mind. 10 Zeichen) fehlt",
			path: ["decisionNote"],
		},
	);

export const reopenSupplierAssessmentSchema = z.object({
	assessmentId: uuid,
	note: z.string().trim().min(3).max(2000),
});

const ART30_CODES = new Set(ART30_CLAUSES.map((c) => c.code));
const clauseValue = z.union([
	z.boolean(),
	z.enum(["teilweise", "nicht anwendbar"]),
]);

export const contractClausesSchema = z.object({
	providerId: uuid,
	clauses: z
		.record(z.string(), clauseValue.nullable())
		.refine((r) => Object.keys(r).every((k) => ART30_CODES.has(k)), {
			message: "Unbekannte Klausel",
		}),
});

// Portal: der Fragebogen kommt aus dem Token, nicht aus der Eingabe.
export const portalAnswerSchema = z
	.object({
		questionCode: code,
		answer: z.enum(ASSESSMENT_ANSWERS).nullable(),
		comment: z.string().trim().max(4000).optional(),
		naReason: z.string().trim().max(1000).optional(),
	})
	.refine((v) => v.answer !== "na" || (v.naReason ?? "").length >= 3, {
		message: "Begründung für „nicht anwendbar“ fehlt",
		path: ["naReason"],
	});

export const portalFileSchema = z.object({
	questionCode: code,
	evidenceId: uuid,
});

// Lebenszyklus (L1): Bedarf melden, Bedarf annehmen/ablehnen, in Betrieb
// nehmen, fehlende Angaben zu Auslagerung und Ausstieg
export const providerRequestSchema = z.object({
	name: shortText,
	serviceDescription: z.string().trim().min(10).max(4000),
	reason: z.string().trim().max(4000).optional(),
	processesPersonalData: z.boolean().default(false),
	isIct: z.boolean().default(true),
	ownerUserId: responsibleRef,
});

export const providerStepSchema = z
	.object({
		providerId: uuid,
		step: z.enum(["accept", "decline", "activate"]),
		note: z.string().trim().max(2000).optional(),
	})
	.refine((v) => v.step !== "decline" || (v.note ?? "").length >= 10, {
		message: "Begründung (mind. 10 Zeichen) fehlt",
		path: ["note"],
	});

const subcontractor = z.object({
	name: z.string().trim().min(1).max(200),
	country: z.string().trim().max(2).optional(),
	service: z.string().trim().max(200).optional(),
});

export const providerDetailsSchema = z.object({
	providerId: uuid,
	lei: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z0-9]{18}[0-9]{2}$/, "LEI hat 20 Zeichen")
		.nullable()
		.optional()
		.or(z.literal("").transform(() => null)),
	substitutability: z
		.enum(["easy", "difficult", "not_substitutable"])
		.nullable()
		.optional(),
	dpaSignedAt: isoDate.nullable().optional(),
	// null = noch nicht erfasst, [] = keine Unterauftragnehmer
	subcontractors: z.array(subcontractor).max(50).nullable().optional(),
	exitStrategy: z.string().trim().max(4000).nullable().optional(),
	exitPlanTestedAt: isoDate.nullable().optional(),
});
