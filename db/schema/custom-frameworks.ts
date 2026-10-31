import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, ref, stringList, ts, userRef } from "./_shared";
import type { Domain } from "./enums";

// Eigene Rahmenwerke je Organisation (R4): Anforderungen von Kund:innen,
// Konzernvorgaben, lizenzierte Kataloge. Sie liegen nicht in den globalen
// Katalog-Tabellen (ohne RLS, Slugs global eindeutig), sondern hier; im
// Katalog der Org erscheinen sie mit Slug `x-<key>` (lib/compliance/
// org-catalog.ts). Schreiben nur über lib/custom-frameworks/service.ts.

export const CUSTOM_FRAMEWORK_ORIGINS = [
	"customer",
	"group",
	"licensed",
	"internal",
	"copy",
] as const;
export type CustomFrameworkOrigin = (typeof CUSTOM_FRAMEWORK_ORIGINS)[number];

export const CUSTOM_FRAMEWORK_STATUSES = [
	"draft",
	"active",
	"retired",
] as const;
export type CustomFrameworkStatus = (typeof CUSTOM_FRAMEWORK_STATUSES)[number];

export const customFrameworks = pgTable(
	"custom_frameworks",
	{
		id: pk(),
		organizationId: orgId(),
		// Kurzname, im Katalog als `x-<key>`
		key: text().notNull(),
		name: text().notNull(),
		version: text(),
		// Herausgeber, z. B. Name der Kundin oder des Konzerns
		issuer: text(),
		origin: text().$type<CustomFrameworkOrigin>().notNull(),
		description: text(),
		sourceUrl: text(),
		// Ausschluss einzelner Anforderungen mit Begründung erlaubt?
		exclusionAllowed: boolean().notNull().default(false),
		exclusionLabel: text(),
		status: text().$type<CustomFrameworkStatus>().notNull().default("draft"),
		// Slug des Klick-Rahmenwerks, wenn kopiert
		copiedFrom: text(),
		activatedAt: ts(),
		activatedBy: userRef(),
		retiredAt: ts(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("custom_frameworks_org_key_uq").on(t.organizationId, t.key),
		orgPolicy("custom_frameworks"),
	],
).enableRLS();

export const customFrameworkSections = pgTable(
	"custom_framework_sections",
	{
		id: pk(),
		organizationId: orgId(),
		frameworkId: ref(() => customFrameworks.id, "cascade").notNull(),
		code: text().notNull(),
		title: text().notNull(),
		sortOrder: integer().notNull().default(0),
	},
	(t) => [
		uniqueIndex("custom_framework_sections_uq").on(t.frameworkId, t.code),
		orgPolicy("custom_framework_sections"),
	],
).enableRLS();

export const customRequirements = pgTable(
	"custom_requirements",
	{
		id: pk(),
		organizationId: orgId(),
		frameworkId: ref(() => customFrameworks.id, "cascade").notNull(),
		sectionCode: text().notNull(),
		code: text().notNull(),
		title: text().notNull(),
		text: text().notNull(),
		domain: text().$type<Domain>().notNull(),
		guidance: text(),
		auditQuestions: stringList(),
		evidenceHints: stringList(),
		sortOrder: integer().notNull().default(0),
		// Ausschluss steht hier (requirement_applicability hängt am globalen
		// Katalog); nur wenn das Rahmenwerk ihn erlaubt
		excluded: boolean().notNull().default(false),
		exclusionReason: text(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("custom_requirements_uq").on(t.frameworkId, t.code),
		index("custom_requirements_org_idx").on(t.organizationId),
		orgPolicy("custom_requirements"),
	],
).enableRLS();

export const customRequirementControls = pgTable(
	"custom_requirement_controls",
	{
		id: pk(),
		organizationId: orgId(),
		requirementId: ref(() => customRequirements.id, "cascade").notNull(),
		// Klick-Control (CC-*), geprüft gegen CONTROL_BY_CODE
		controlCode: text().notNull(),
		coverage: text().$type<"full" | "partial">().notNull().default("full"),
		note: text(),
	},
	(t) => [
		uniqueIndex("custom_requirement_controls_uq").on(
			t.requirementId,
			t.controlCode,
		),
		orgPolicy("custom_requirement_controls"),
	],
).enableRLS();

export type CustomFramework = typeof customFrameworks.$inferSelect;
export type CustomFrameworkSection =
	typeof customFrameworkSections.$inferSelect;
export type CustomRequirement = typeof customRequirements.$inferSelect;
export type CustomRequirementControl =
	typeof customRequirementControls.$inferSelect;
