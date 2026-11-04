import { z } from "zod";
import { ALERT_CHANNELS } from "@/db/schema/enums";
import { BIA_MAX_HOURS, BIA_MAX_STEPS } from "@/lib/bcm/bia";
import { longText, uuid } from "./common";

// Notfallmanagement (lib/bcm/*): Eingaben der geführten BIA
const level = z.coerce.number().int().min(0).max(5);

export const saveBiaSchema = z.object({
	processId: uuid,
	steps: z
		.array(z.coerce.number().int().min(1).max(BIA_MAX_HOURS))
		.min(2)
		.max(BIA_MAX_STEPS),
	threshold: z.coerce.number().int().min(1).max(5),
	impacts: z.record(
		z.string().min(1).max(40),
		z.array(level).max(BIA_MAX_STEPS),
	),
	dataLossHours: z.coerce
		.number()
		.int()
		.min(0)
		.max(BIA_MAX_HOURS)
		.nullable()
		.optional(),
	notes: longText.optional(),
	// Vorschlag übernehmen: RTO/RPO/MTPD und Kritikalität am Prozess setzen
	adopt: z.boolean().default(false),
	adoptCriticality: z.boolean().default(false),
});

// Notfallplan je Prozess (N3)
const planText = z.string().max(2000).default("");
export const bcmPlanContentSchema = z.object({
	trigger: planText,
	activatedBy: z.string().max(300).default(""),
	immediate: z.array(z.object({ text: z.string().max(300) })).max(30),
	alert: z
		.array(
			z.object({
				who: z.string().max(120),
				channel: z.enum(ALERT_CHANNELS),
				withinMinutes: z.coerce.number().int().min(0).max(10_080).nullable(),
			}),
		)
		.max(30),
	emergencyMode: planText,
	recovery: z
		.array(
			z.object({
				text: z.string().max(300),
				who: z.string().max(120),
				targetHours: z.coerce.number().int().min(0).max(100_000).nullable(),
				assetId: uuid.nullable(),
			}),
		)
		.max(30),
	returnToNormal: planText,
	contacts: z
		.array(
			z.object({
				name: z.string().max(120),
				role: z.string().max(120),
				phone: z.string().max(60),
				mail: z.string().max(200),
			}),
		)
		.max(30),
});

export const saveBcmPlanSchema = z.object({
	processId: uuid,
	content: bcmPlanContentSchema,
});

export const releaseBcmPlanSchema = z.object({ processId: uuid });
