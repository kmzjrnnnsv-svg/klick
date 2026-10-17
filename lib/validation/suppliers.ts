import { z } from "zod";
import { ASSESSMENT_ANSWERS } from "@/db/schema/enums";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { email, uuid } from "./common";

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
