import {
	date,
	doublePrecision,
	index,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { json, orgId, pk, timestamps, ts, userRef } from "./_shared";
import type { SupplierCriterion } from "./platform";
import { providers } from "./registers";

// Interne Lieferantenbewertung (Kriterien 1–5 mit Gewichten je Bereich,
// Schwellen → Niveau/Ampel/Empfehlung/Wiedervorlage, Maßnahmen, Freigabe).
// Kriterien werden beim Start als Schnappschuss gespeichert; der
// Portal-Fragebogen (assessments, kind supplier) bleibt die Selbstauskunft.

export type RatingScore = {
	score: number | null;
	note?: string;
	ratedBy?: string;
	ratedAt?: string;
	// Vorbelegung aus den Stammdaten (Begründung)
	prefilled?: string;
};

export type RatingProfile = {
	category?: string | null;
	criticality?: string;
	// Entscheidungsbaum Auslagerung (MaRisk AT 9 / ZAG § 26 / MiCAR Art. 73)
	instituteTask?: boolean | null;
	oneOff?: boolean | null;
	material?: boolean | null;
	// DORA: unterstützt eine kritische oder wichtige Funktion
	criticalFunction?: boolean | null;
};

export type RatingMeasure = {
	code: string;
	title: string;
	taskId: string | null;
};

export const RATING_DECISIONS = [
	"open",
	"approved",
	"approved_with_conditions",
	"rejected",
] as const;

export const providerRatings = pgTable(
	"provider_ratings",
	{
		id: pk(),
		organizationId: orgId(),
		providerId: uuid()
			.notNull()
			.references(() => providers.id, { onDelete: "cascade" }),
		code: text().notNull(),
		status: text({ enum: ["draft", "completed"] })
			.notNull()
			.default("draft"),
		criteria: json<SupplierCriterion[]>().notNull(),
		areaWeights: json<{ general: number; security: number }>().notNull(),
		scores: json<Record<string, RatingScore>>().notNull().default({}),
		profile: json<RatingProfile>().notNull().default({}),
		generalScore: doublePrecision(),
		securityScore: doublePrecision(),
		totalScore: doublePrecision(),
		level: text(),
		traffic: text({ enum: ["red", "amber", "green"] }),
		measures: json<RatingMeasure[]>().notNull().default([]),
		decision: text({ enum: RATING_DECISIONS }).notNull().default("open"),
		decisionNote: text(),
		decidedByUserId: userRef(),
		decidedAt: ts(),
		approvalRequestId: uuid(),
		nextAssessmentAt: date(),
		createdByUserId: userRef(),
		completedAt: ts(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("provider_ratings_provider_idx").on(t.providerId),
		orgPolicy("provider_ratings"),
	],
).enableRLS();

export type ProviderRating = typeof providerRatings.$inferSelect;
