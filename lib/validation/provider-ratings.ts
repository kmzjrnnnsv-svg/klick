import { z } from "zod";
import { CRITICALITY } from "@/db/schema/enums";
import { PROVIDER_CATEGORIES } from "@/db/schema/registers";
import { uuid } from "./common";

// Interne Lieferantenbewertung (/dienstleister/[id]/bewertung/[ratingId]).

export const startProviderRatingSchema = z.object({ providerId: uuid });

export const rateCriterionSchema = z.object({
	ratingId: uuid,
	code: z.string().regex(/^SC-[A-Z]-\d{2}$/),
	score: z.coerce.number().int().min(1).max(5).nullable(),
	note: z.string().trim().max(2000).optional(),
});

export const saveRatingProfileSchema = z.object({
	ratingId: uuid,
	category: z.enum(PROVIDER_CATEGORIES).nullable().optional(),
	criticality: z.enum(CRITICALITY).optional(),
	instituteTask: z.boolean().nullable().optional(),
	oneOff: z.boolean().nullable().optional(),
	material: z.boolean().nullable().optional(),
	criticalFunction: z.boolean().nullable().optional(),
});

export const completeProviderRatingSchema = z.object({
	ratingId: uuid,
	decision: z.enum(["approved", "approved_with_conditions", "rejected"]),
	decisionNote: z.string().trim().max(4000).optional(),
	measures: z
		.array(
			z.object({
				code: z.string().regex(/^SM-[A-Z0-9]{1,3}$/),
				ownerUserId: uuid.nullable().optional(),
				dueAt: z.iso.date().nullable().optional(),
			}),
		)
		.max(30)
		.default([]),
	selfApprovalReason: z.string().trim().max(2000).optional(),
});

export const ratingIdSchema = z.object({ ratingId: uuid });
