import {
	type AnyPgColumn,
	date,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { json, pk, stringList } from "./_shared";
import {
	type CASP_SERVICES,
	CONTROL_KINDS,
	CONTROL_TEST_METHODS,
	COVERAGE,
	DOMAINS,
	EFFORTS,
	LEGAL_STATUS,
	LICENCE_STAGES,
	type ORG_ROLES_LEGAL,
} from "./enums";

// Referenzkatalog — global, geseedet aus lib/compliance/catalog, kein RLS.
// Hub-and-Spoke: requirements (das Warum) ↔ controls (das Was) über
// control_requirements (die Synergie-Kante).

export type Recommendation = {
	level: "must" | "should" | "could";
	text: string;
	source?: string;
	ref?: string;
};
export type Tools = { startup: string[]; scale: string[] };

export const frameworks = pgTable("frameworks", {
	id: pk(),
	slug: text().notNull().unique(),
	name: text().notNull(),
	version: text(),
	authority: text(),
	jurisdiction: text().notNull().default("eu"),
	legalBasis: text(),
	legalBasisRefs: stringList(),
	description: text(),
	recommendedApproach: text(),
	sourceUrl: text(),
	successorFrameworkId: uuid().references((): AnyPgColumn => frameworks.id, {
		onDelete: "set null",
	}),
	sortOrder: integer().notNull().default(0),
});

export const frameworkSections = pgTable(
	"framework_sections",
	{
		id: pk(),
		frameworkId: uuid()
			.notNull()
			.references(() => frameworks.id, { onDelete: "cascade" }),
		code: text().notNull(),
		title: text().notNull(),
		sortOrder: integer().notNull().default(0),
	},
	(t) => [unique().on(t.frameworkId, t.code)],
);

export const requirements = pgTable(
	"requirements",
	{
		id: pk(),
		frameworkId: uuid()
			.notNull()
			.references(() => frameworks.id, { onDelete: "cascade" }),
		sectionId: uuid().references(() => frameworkSections.id, {
			onDelete: "set null",
		}),
		code: text().notNull(),
		title: text().notNull(),
		requirementText: text().notNull(),
		guidance: text(),
		legalBasisRefs: stringList(),
		domain: text({ enum: DOMAINS }).notNull(),
		services: json<(typeof CASP_SERVICES)[number][]>(),
		appliesFromStage: text({ enum: LICENCE_STAGES }),
		appliesToRoles: json<(typeof ORG_ROLES_LEGAL)[number][]>(),
		effectiveFrom: date(),
		effectiveUntil: date(),
		legalStatus: text({ enum: LEGAL_STATUS }).notNull().default("in_force"),
		evidenceHints: stringList(),
		sourceUrl: text(),
		relatedRequirements: stringList(),
		recommendations: json<Recommendation[]>(),
		auditQuestions: stringList(),
		pitfalls: stringList(),
		tools: json<Tools>(),
		sortOrder: integer().notNull().default(0),
	},
	(t) => [
		unique().on(t.frameworkId, t.code),
		index("requirements_domain_idx").on(t.domain),
	],
);

export const controls = pgTable("controls", {
	id: pk(),
	code: text().notNull().unique(),
	title: text().notNull(),
	description: text().notNull(),
	implementationGuidance: text(),
	domain: text({ enum: DOMAINS }).notNull(),
	effort: text({ enum: EFFORTS }).notNull().default("M"),
	kind: text({ enum: CONTROL_KINDS }).notNull().default("organizational"),
	evidenceHints: stringList(),
	recommendations: json<Recommendation[]>(),
	auditQuestions: stringList(),
	testMethodHint: text({ enum: CONTROL_TEST_METHODS }),
	templates: stringList(),
	processes: stringList(),
	obligations: stringList(),
	tools: json<Tools>(),
	sortOrder: integer().notNull().default(0),
});

export const controlRequirements = pgTable(
	"control_requirements",
	{
		id: pk(),
		controlId: uuid()
			.notNull()
			.references(() => controls.id, { onDelete: "cascade" }),
		requirementId: uuid()
			.notNull()
			.references(() => requirements.id, { onDelete: "cascade" }),
		coverage: text({ enum: COVERAGE }).notNull().default("full"),
		note: text(),
	},
	(t) => [
		unique().on(t.controlId, t.requirementId),
		index("control_requirements_requirement_idx").on(t.requirementId),
	],
);

export type Framework = typeof frameworks.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Control = typeof controls.$inferSelect;
export type ControlRequirement = typeof controlRequirements.$inferSelect;
