import { z } from "zod";
import { MANAGEMENT_REPORT_KINDS } from "@/db/schema/enums";
import { shortText, uuid } from "./common";

// Berichte an die Geschäftsleitung (N3)
export const managementReportSchema = z
	.object({
		id: uuid.optional(),
		kind: z.enum(MANAGEMENT_REPORT_KINDS),
		title: shortText,
		periodFrom: z.iso.date(),
		periodTo: z.iso.date(),
		summary: z.string().trim().max(10_000).nullable().optional(),
		measures: z.string().trim().max(10_000).nullable().optional(),
	})
	.refine((r) => r.periodFrom <= r.periodTo, {
		message: "Der Zeitraum endet vor seinem Beginn",
		path: ["periodTo"],
	});

export const managementReportIdSchema = z.object({ id: uuid });
