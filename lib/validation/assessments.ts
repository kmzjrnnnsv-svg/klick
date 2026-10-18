import { z } from "zod";
import { ASSESSMENT_ANSWERS } from "@/db/schema/enums";
import { frameworkSlugs, uuid } from "./common";

const code = z.string().min(1).max(60);
const isoDate = z.iso.date();

export const createAssessmentSchema = z.object({
	frameworks: frameworkSlugs.optional(),
	title: z.string().trim().max(200).optional(),
	asOf: isoDate.nullable().optional(),
	// nur Controls, die eine frühere Gap-Analyse noch nicht abgefragt hat
	onlyNew: z.boolean().optional(),
});

export const answerQuestionSchema = z
	.object({
		assessmentId: uuid,
		questionCode: code,
		answer: z.enum(ASSESSMENT_ANSWERS).nullable(),
		comment: z.string().trim().max(4000).optional(),
		naReason: z.string().trim().max(1000).optional(),
	})
	.refine((v) => v.answer !== "na" || (v.naReason ?? "").length >= 3, {
		message: "Begründung für „nicht anwendbar“ fehlt",
		path: ["naReason"],
	});

export const linkAnswerEvidenceSchema = z.object({
	assessmentId: uuid,
	questionCode: code,
	evidenceId: uuid,
});

export const delegateQuestionSchema = z.object({
	assessmentId: uuid,
	questionCode: code,
	assigneeUserId: uuid,
	dueAt: isoDate.nullable().optional(),
});

export const reviewAnswerSchema = z.object({
	assessmentId: uuid,
	questionCode: code,
	verdict: z.enum(["confirmed", "adjusted", "clarify"]),
	reviewerAnswer: z.enum(ASSESSMENT_ANSWERS).nullable().optional(),
	note: z.string().trim().max(2000).optional(),
});

export const assessmentIdSchema = z.object({ assessmentId: uuid });

export const createMeasuresSchema = z.object({
	assessmentId: uuid,
	items: z
		.array(
			z.object({
				controlCode: code,
				kind: z.enum(["implement", "clarify", "evidence"]),
			}),
		)
		.min(1)
		.max(200),
	assigneeUserId: uuid.nullable().optional(),
	// Fristvorschlag: Tage ab heute je Aufwand (S/M/L) oder feste Frist
	dueAt: isoDate.nullable().optional(),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
