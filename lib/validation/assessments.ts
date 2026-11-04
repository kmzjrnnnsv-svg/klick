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
	// Kurz-Check (die wichtigsten Fragen) oder alle; ohne Angabe alle
	scope: z.enum(["short", "all"]).optional(),
});

export const extendAssessmentSchema = z.object({ assessmentId: uuid });

export const answerQuestionSchema = z
	.object({
		assessmentId: uuid,
		questionCode: code,
		answer: z.enum(ASSESSMENT_ANSWERS).nullable(),
		comment: z.string().trim().max(4000).optional(),
		naReason: z.string().trim().max(1000).optional(),
	})
	// „Nicht relevant“ braucht eine Begründung, die eine zweite Person
	// bestätigen kann (gleich NA_REASON_MIN in der Fragekarte)
	.refine((v) => v.answer !== "na" || (v.naReason ?? "").length >= 10, {
		message: "Begründung für „nicht relevant“ fehlt (mindestens 10 Zeichen)",
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
	// Fristen aus dem Umsetzungsplan (Teil C): Beginn und Ende je Maßnahme,
	// zuständig die verantwortliche Person des Controls; der Server rechnet
	// den Plan selbst, die Eingabe nennt nur die Auswahl
	fromPlan: z.boolean().optional(),
});

// Umsetzungsplan: nur Einstellungen; der Plan wird immer neu gerechnet
export const planSettingsSchema = z.object({
	assessmentId: uuid,
	start: isoDate,
	capacity: z.number().int().min(1).max(5),
	overrides: z
		.record(
			z.string().regex(/^CC-[A-Z0-9]+-[0-9A-Z]+$/),
			z.number().int().min(1).max(250),
		)
		.refine((o) => Object.keys(o).length <= 400, "zu viele Einträge"),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
