import {
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
	ownerFunction,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import {
	ASSESSMENT_ANSWERS,
	ASSESSMENT_KINDS,
	ASSESSMENT_STATUS,
	type AssessmentQuestion,
} from "./enums";

// Fragebögen: geführte Gap-Analyse (kind self, Fragen aus dem Katalog je
// Control), Lieferantenbewertung (supplier), Produkt-Checklisten (product).
// Antworten, Bewertung und Nachweise je Frage; Score/Ergebnis werden beim
// Abschluss festgehalten, Abdeckung bleibt abgeleitet.

export const assessments = pgTable(
	"assessments",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		kind: text({ enum: ASSESSMENT_KINDS }).notNull().default("self"),
		subjectType: text({ enum: ["provider", "product", "engagement"] }),
		subjectId: uuid(),
		templateCode: text().notNull(),
		templateVersion: text().notNull().default("1"),
		title: text().notNull(),
		frameworks: stringList(),
		asOf: date(),
		questions: json<AssessmentQuestion[]>().notNull().default([]),
		status: text({ enum: ASSESSMENT_STATUS }).notNull().default("in_progress"),
		score: integer(),
		rating: text(),
		result: json<Record<string, unknown>>(),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		reviewerUserId: userRef(),
		dueAt: date(),
		submittedAt: ts(),
		completedAt: ts(),
		appliedAt: ts(),
		appliedByUserId: userRef(),
		// Lieferanten-Bewertung
		decision: text({ enum: ["accept", "accept_with_conditions", "reject"] }),
		decisionNote: text(),
		contactName: text(),
		contactEmail: text(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("assessments_subject_idx").on(t.subjectType, t.subjectId),
		orgPolicy("assessments"),
	],
).enableRLS();

export const assessmentAnswers = pgTable(
	"assessment_answers",
	{
		id: pk(),
		organizationId: orgId(),
		assessmentId: uuid()
			.notNull()
			.references(() => assessments.id, { onDelete: "cascade" }),
		questionCode: text().notNull(),
		answer: text({ enum: ASSESSMENT_ANSWERS }),
		naReason: text(),
		comment: text(),
		evidenceIds: stringList(),
		answeredBy: text({ enum: ["user", "supplier"] })
			.notNull()
			.default("user"),
		answeredByUserId: userRef(),
		// Bewertung durch ISB/Berater:in: bestätigt oder abweichend bewertet
		reviewerVerdict: text({ enum: ["confirmed", "adjusted", "clarify"] }),
		reviewerAnswer: text({ enum: ASSESSMENT_ANSWERS }),
		reviewerNote: text(),
		reviewedByUserId: userRef(),
		reviewedAt: ts(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.assessmentId, t.questionCode),
		orgPolicy("assessment_answers"),
	],
).enableRLS();

export type Assessment = typeof assessments.$inferSelect;
export type AssessmentAnswerRow = typeof assessmentAnswers.$inferSelect;
