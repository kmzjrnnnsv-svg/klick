import { z } from "zod";
import { CUSTOM_FRAMEWORK_ORIGINS } from "@/db/schema/custom-frameworks";
import { DOMAINS } from "@/db/schema/enums";
import { MAX_CONTROLS_PER_REQUIREMENT } from "@/lib/custom-frameworks/rules";
import { httpUrl, uuid } from "./common";

// Eigene Rahmenwerke (R4). Außerhalb der "use server"-Datei, weil
// Server-Action-Module nur async Funktionen exportieren dürfen.

const opt = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v ? v : undefined));

export const customKey = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/, "key_invalid");

export const customFrameworkSchema = z.object({
	name: z.string().trim().min(2).max(120),
	key: customKey.optional(),
	version: opt(40),
	issuer: opt(120),
	origin: z.enum(CUSTOM_FRAMEWORK_ORIGINS).default("customer"),
	description: opt(4000),
	sourceUrl: httpUrl.optional().or(z.literal("").transform(() => undefined)),
	exclusionAllowed: z.boolean().default(false),
	exclusionLabel: opt(120),
});
export type CustomFrameworkInput = z.input<typeof customFrameworkSchema>;

export const customFrameworkUpdateSchema = customFrameworkSchema
	.omit({ key: true, origin: true })
	.extend({ id: uuid });

export const copyFrameworkSchema = z.object({
	slug: z.string().min(1).max(40),
	name: z.string().trim().min(2).max(120).optional(),
	key: customKey.optional(),
});

export const sectionSchema = z.object({
	frameworkId: uuid,
	code: z.string().trim().min(1).max(40),
	title: z.string().trim().min(1).max(200),
	sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const controlMappingSchema = z.object({
	code: z.string().regex(/^CC-[A-Z0-9]+-[0-9A-Z]+$/),
	coverage: z.enum(["full", "partial"]).default("full"),
	note: opt(500),
});

export const requirementSchema = z.object({
	frameworkId: uuid,
	id: uuid.optional(),
	sectionCode: z.string().trim().min(1).max(40),
	code: z.string().trim().min(1).max(40),
	title: z.string().trim().min(1).max(300),
	text: z.string().trim().min(1).max(5000),
	domain: z.enum(DOMAINS),
	guidance: opt(5000),
	auditQuestions: z
		.array(z.string().trim().min(1).max(500))
		.max(10)
		.default([]),
	evidenceHints: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
	controls: z
		.array(controlMappingSchema)
		.max(MAX_CONTROLS_PER_REQUIREMENT)
		.default([]),
});
export type RequirementInput = z.input<typeof requirementSchema>;

export const exclusionSchema = z.object({
	requirementId: uuid,
	excluded: z.boolean(),
	reason: z.string().trim().max(2000).default(""),
});

export const csvImportSchema = z.object({
	frameworkId: uuid,
	csv: z.string().min(1).max(2_000_000),
	// nur prüfen und zählen, nichts schreiben
	dryRun: z.boolean().default(true),
});
