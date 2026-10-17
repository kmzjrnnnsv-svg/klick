import { z } from "zod";

// Lieferantenbewertung je Org (Einstellungen → Lieferantenbewertung).

const anchor = z.string().trim().max(400);
const five = <T extends z.ZodType>(s: T) => z.tuple([s, s, s, s, s]);

export const supplierMethodSchema = z
	.object({
		areaWeights: z.object({
			general: z.coerce.number().min(0).max(1),
			security: z.coerce.number().min(0).max(1),
		}),
		criteria: z
			.array(
				z.object({
					code: z.string().regex(/^SC-[A-Z]-\d{2}$/),
					area: z.enum(["general", "security"]),
					title: z.string().trim().min(1).max(200),
					weight: z.coerce.number().min(0).max(1),
					anchors: five(anchor),
					enabled: z.boolean(),
					frameworks: z.array(z.string().max(20)).max(20).optional(),
					partnerTypes: z.array(z.string().max(30)).max(10).optional(),
					outsourcingOnly: z.boolean().optional(),
				}),
			)
			.min(2)
			.max(40),
		thresholds: z
			.array(
				z.object({
					min: z.coerce.number().min(0).max(5),
					level: z.string().trim().min(1).max(40),
					traffic: z.enum(["red", "amber", "green"]),
					status: z.string().trim().min(1).max(60),
					recommendation: z.string().trim().min(1).max(200),
					months: z.coerce.number().int().min(1).max(60),
				}),
			)
			.min(2)
			.max(8),
		criticalMaxMonths: z.coerce.number().int().min(1).max(60),
	})
	.superRefine((m, ctx) => {
		if (m.areaWeights.general + m.areaWeights.security <= 0)
			ctx.addIssue({
				code: "custom",
				message: "Mindestens ein Bereich braucht ein Gewicht.",
				path: ["areaWeights"],
			});
		for (const area of ["general", "security"] as const)
			if (!m.criteria.some((c) => c.area === area && c.enabled && c.weight > 0))
				ctx.addIssue({
					code: "custom",
					message:
						"Jeder Bereich braucht mindestens ein aktives Kriterium mit Gewicht.",
					path: ["criteria"],
				});
		const mins = m.thresholds.map((t) => t.min);
		if (mins[0] !== 0 || mins.some((v, i) => i > 0 && v <= (mins[i - 1] ?? 0)))
			ctx.addIssue({
				code: "custom",
				message: "Schwellen aufsteigend ordnen; die erste beginnt bei 0.",
				path: ["thresholds"],
			});
		const codes = m.criteria.map((c) => c.code);
		if (new Set(codes).size !== codes.length)
			ctx.addIssue({
				code: "custom",
				message: "Kriterium doppelt.",
				path: ["criteria"],
			});
	});
