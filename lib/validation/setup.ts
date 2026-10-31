import { z } from "zod";
import {
	CASP_SERVICES,
	LICENCE_STAGES,
	ROLE_FUNCTIONS,
} from "@/db/schema/enums";
import { PROVIDER_CATEGORIES, SITE_KINDS } from "@/db/schema/registers";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import { RESPONSIBILITY_AREAS } from "@/lib/compliance/catalog/domain-functions";
import { SETUP_STEPS } from "@/lib/setup/steps";
import { frameworkSlugs, shortText, uuid } from "./common";
import { sectorSchema } from "./org";

// Geführte Einrichtung (D0–D5)

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => (v === "" ? undefined : v))
		.optional();
const optionalInt = z.coerce.number().int().min(0).max(10_000_000).optional();
const optionalEur = z.coerce.number().min(0).max(1e13).optional();

export const setupStepSchema = z.object({ step: z.enum(SETUP_STEPS) });

// Schritt 1: Funktion besetzen — ich, Mitglied, Einladung oder extern
// eine Zeile je Person und Funktion: mit `id` wird genau diese Zeile
// geändert, ohne wird eine weitere Person bestellt (mehrere je Funktion)
const assignBase = {
	id: uuid.optional(),
	function: z.enum(ROLE_FUNCTIONS),
	deputyUserId: uuid.nullable().optional(),
};
export const setupAssignSchema = z
	.discriminatedUnion("mode", [
		z.object({ mode: z.literal("me"), ...assignBase }),
		z.object({ mode: z.literal("member"), ...assignBase, userId: uuid }),
		z.object({
			mode: z.literal("invite"),
			...assignBase,
			name: shortText,
			email: z.email(),
			role: z.enum(ORG_ROLES).exclude(["owner"]),
			sendMail: z.boolean().default(true),
		}),
		z.object({ mode: z.literal("external"), ...assignBase, name: shortText }),
	])
	.refine((d) => !(d.mode === "member" && d.deputyUserId === d.userId), {
		message: "Die Vertretung muss eine andere Person sein.",
		path: ["deputyUserId"],
	});
export type SetupAssignInput = z.input<typeof setupAssignSchema>;

// Schritt 2: Unternehmen und Größe
export const companyProfileSchema = z.object({
	legalForm: optionalText(80),
	registerNumber: optionalText(80),
	country: z
		.string()
		.trim()
		.toUpperCase()
		.transform((v) => (v === "" ? undefined : v))
		.pipe(z.string().length(2, "Ländercode, zwei Buchstaben").optional()),
	employees: optionalInt,
	revenueEur: optionalEur,
	totalAssetsEur: optionalEur,
	nis2Sector: optionalText(40),
	customerTypes: z
		.array(z.enum(["b2b", "b2c", "public"]))
		.max(3)
		.default([]),
});
export type CompanyProfileInput = z.input<typeof companyProfileSchema>;

// Schritt 3: Standorte
export const siteSchema = z.object({
	name: shortText,
	kind: z.enum(SITE_KINDS),
	country: optionalText(2),
	city: optionalText(120),
	employees: optionalInt,
	critical: z.boolean().default(false),
});
export type SiteInput = z.input<typeof siteSchema>;
export const deleteSiteSchema = z.object({ id: uuid });

// Schritt 4: Tätigkeit und Lizenz
export const activitySchema = z.object({
	sector: sectorSchema,
	licenceStage: z.enum(LICENCE_STAGES),
	caspServices: z.array(z.enum(CASP_SERVICES)).max(10).default([]),
	issuesTokens: z.enum(["none", "art", "emt", "other"]).default("none"),
	digitalProducts: z.boolean().default(false),
});
export type ActivityInput = z.input<typeof activitySchema>;

// Schritt 5: IT, Dienstleister, Daten
export const itDataSchema = z.object({
	itOperation: z.enum(["cloud", "hybrid", "own_dc"]),
	personalData: z.array(z.string().min(1).max(40)).max(20).default([]),
	specialCategories: z.boolean().default(false),
	dataSubjects: z.enum(["lt1k", "1k_100k", "gt100k"]).optional(),
	customerCountries: z.array(z.string().length(2)).max(60).default([]),
	cardData: z.enum(["none", "outsourced", "own"]).optional(),
	// KI: keine, Dienste anderer nutzen, eigene KI bauen oder anbieten
	aiUse: z.enum(["none", "use", "build"]).optional(),
	// arbeitet für Autohersteller oder deren Zulieferer (TISAX)
	automotive: z.boolean().optional(),
	// Personendaten gehen an Dienstleister in den USA (DPF prüfen)
	usTransfers: z.boolean().optional(),
	// Darf eine KI Inhalte lesen? (ADR-032; wirkt nur, solange die KI aus ist)
	aiMaxClass: z.enum(["none", "internal", "confidential"]).optional(),
	providers: z
		.array(
			z.object({
				name: shortText,
				service: optionalText(200),
				category: z.enum(PROVIDER_CATEGORIES),
				critical: z.boolean().default(false),
			}),
		)
		.max(30)
		.default([]),
});
export type ItDataInput = z.input<typeof itDataSchema>;

// Schritt 6 + 7
export const setupFrameworksSchema = z.object({
	frameworks: frameworkSlugs.min(1, "mindestens ein Rahmenwerk"),
});
export const setupGapSchema = z.object({ frameworks: frameworkSlugs.min(1) });

// „Wer ist für welchen Bereich verantwortlich?“ (Schritt Rollen)
export const setupAreasSchema = z.object({
	areas: z
		.array(
			z.object({
				area: z.enum(RESPONSIBILITY_AREAS),
				function: z.enum(ROLE_FUNCTIONS),
			}),
		)
		.min(1)
		.max(RESPONSIBILITY_AREAS.length),
});
