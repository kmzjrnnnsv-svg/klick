import { z } from "zod";
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
