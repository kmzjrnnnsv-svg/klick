import { z } from "zod";
import {
	ISMS_OFF_REASON_MAX,
	ISMS_OFF_REASON_MIN,
	ISMS_UNITS_BOUNDS,
	ISMS_WORKDAYS_BOUNDS,
	ISMS_YEAR_MAX,
} from "@/lib/isms-plan/adjust";

// ISMS-Jahresplan je Org (P2b): Anpassung eines Punkts, Arbeitstage

const pt = z.number().min(0).max(ISMS_YEAR_MAX);

export const ismsItemAdjustSchema = z
	.object({
		key: z.string().min(1).max(60),
		off: z.boolean(),
		offReason: z.string().trim().max(ISMS_OFF_REASON_MAX).optional(),
		yearMin: pt.optional(),
		yearMax: pt.optional(),
		units: z
			.number()
			.int()
			.min(ISMS_UNITS_BOUNDS[0])
			.max(ISMS_UNITS_BOUNDS[1])
			.optional(),
	})
	.superRefine((d, ctx) => {
		if (d.off && (d.offReason ?? "").length < ISMS_OFF_REASON_MIN)
			ctx.addIssue({
				code: "custom",
				path: ["offReason"],
				message: "reason_short",
			});
		if ((d.yearMin === undefined) !== (d.yearMax === undefined))
			ctx.addIssue({ code: "custom", path: ["yearMax"], message: "range" });
		if (
			d.yearMin !== undefined &&
			d.yearMax !== undefined &&
			d.yearMin > d.yearMax
		)
			ctx.addIssue({ code: "custom", path: ["yearMax"], message: "range" });
	});

export const ismsWorkdaysSchema = z.object({
	workdays: z
		.number()
		.int()
		.min(ISMS_WORKDAYS_BOUNDS[0])
		.max(ISMS_WORKDAYS_BOUNDS[1]),
});
