import { z } from "zod";
import {
	TRUST_DOCUMENT_ACCESS,
	TRUST_FRAMEWORK_STATUS,
} from "@/db/schema/enums";
import { slugValid, TRUST_ACCESS_DAYS } from "@/lib/trust/rules";

const optional = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

const email = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("Bitte eine gültige E-Mail-Adresse angeben"));

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.nullish()
	.transform((v) => v ?? null);

export const trustSlugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.refine(
		slugValid,
		"3–40 Zeichen: Kleinbuchstaben, Ziffern und einzelne Bindestriche",
	);

// Einstellungen (Entwurf). Ob ein Dokument mit dem gewählten Zugriff
// erlaubt ist, prüft die Action gegen die Einstufung in der DB.
export const trustSettingsSchema = z.object({
	slug: trustSlugSchema,
	title: z.string().trim().min(3, "Bitte einen Titel angeben").max(160),
	intro: z.string().trim().max(2_000),
	contactEmail: z
		.union([email, z.literal("")])
		.nullish()
		.transform((v) => (v ? v : null)),
	ndaText: z.string().trim().min(20, "Der NDA-Text ist zu kurz").max(6_000),
	indexable: z.boolean(),
	showCoverage: z.boolean(),
	showControls: z.boolean(),
	showSubprocessors: z.boolean(),
	frameworks: z
		.array(
			z.object({
				slug: z.string().min(1).max(40),
				status: z.enum(TRUST_FRAMEWORK_STATUS),
				validUntil: isoDate,
				note: optional(300),
			}),
		)
		.max(40)
		.refine(
			(a) => new Set(a.map((f) => f.slug)).size === a.length,
			"Jedes Rahmenwerk nur einmal",
		),
	documents: z
		.array(
			z.object({
				documentId: z.uuid(),
				access: z.enum(TRUST_DOCUMENT_ACCESS),
			}),
		)
		.max(60)
		.refine(
			(a) => new Set(a.map((d) => d.documentId)).size === a.length,
			"Jedes Dokument nur einmal",
		),
});
export type TrustSettingsInput = z.infer<typeof trustSettingsSchema>;

// Öffentliches Anfrageformular auf /vertrauen/<slug>.
export const trustRequestSchema = z.object({
	slug: trustSlugSchema,
	name: z.string().trim().min(2, "Bitte deinen Namen angeben").max(120),
	email,
	company: z.string().trim().min(2, "Bitte dein Unternehmen angeben").max(160),
	reason: optional(1_000),
	ndaVersion: z.string().regex(/^[0-9a-f]{16}$/),
	ndaAccepted: z.literal(
		true,
		"Bitte die Vertraulichkeitserklärung bestätigen",
	),
	// Honeypot + Zeitstempel (looksAutomated)
	website: z.string().max(500).optional(),
	renderedAt: z.number().optional(),
});

export const trustApproveSchema = z.object({
	id: z.uuid(),
	days: z.coerce
		.number()
		.int()
		.refine((n) => (TRUST_ACCESS_DAYS as readonly number[]).includes(n)),
	sendMail: z.boolean().optional(),
});

export const trustDecisionSchema = z.object({
	id: z.uuid(),
	note: optional(1_000),
});
