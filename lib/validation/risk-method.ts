import { z } from "zod";
import { validateRiskMethod } from "@/lib/compliance/risk-method";
import { RISK_METHOD_ISSUE_TEXT } from "./risk-method-text";

export { RISK_METHOD_ISSUE_TEXT } from "./risk-method-text";

// Risikomethodik je Org (Einstellungen → Risikomethodik). Die fachliche
// Prüfung (Klassen lückenlos, Zonen aufsteigend …) macht validateRiskMethod.

const label = (max: number) => z.string().trim().min(1).max(max);
const anchor = z.string().trim().max(600);
const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/);
// vier (BSI 200-3) oder fünf Stufen; gleich viele prüft validateRiskMethod
const levels = <T extends z.ZodType>(s: T) => z.array(s).min(4).max(5);

export const riskMethodSchema = z
	.object({
		aggregation: z.enum(["sum", "product", "matrix"]),
		likelihood: levels(z.object({ label: label(40), anchor })),
		impact: levels(label(40)),
		dimensions: z
			.array(
				z.object({
					key,
					label: label(80),
					enabled: z.boolean(),
					anchors: levels(anchor),
				}),
			)
			.min(1)
			.max(15),
		classes: z
			.array(
				z.object({
					key,
					label: label(40),
					min: z.coerce.number().int().min(1).max(25),
					max: z.coerce.number().int().min(1).max(25),
					zone: z.enum(["acceptable", "tolerable", "unacceptable"]),
					meaning: z.string().trim().max(1000),
					acceptance: z
						.array(z.enum(["department_head", "management_body"]))
						.max(2)
						.optional(),
				}),
			)
			.min(2)
			.max(5),
		matrix: z.array(z.array(key).min(4).max(5)).min(4).max(5).optional(),
	})
	.superRefine((m, ctx) => {
		for (const issue of validateRiskMethod(m))
			ctx.addIssue({
				code: "custom",
				message: RISK_METHOD_ISSUE_TEXT[issue],
				path: ["classes"],
			});
	});

export const updateRiskMethodSchema = z.object({
	method: riskMethodSchema,
	allowSelfApproval: z.boolean(),
});
