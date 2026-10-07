"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgSettings } from "@/db/schema";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { DEFAULT_PREFIXES } from "@/lib/documents/numbering";
import { type ActionResult, fromZod } from "@/lib/validation/common";

async function stepUp(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		return { ok: true, ctx: await requireStepUp({ settings: ["update"] }) };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
}

const label5 = z.tuple([
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
	z.string().min(1).max(40),
]);
const riskSettingsSchema = z
	.object({
		likelihood: label5,
		impact: label5,
		acceptable: z.coerce.number().int().min(1).max(24),
		tolerable: z.coerce.number().int().min(2).max(25),
		allowSelfApproval: z.boolean(),
	})
	.refine((v) => v.tolerable > v.acceptable, {
		message: "tolerierbar muss grösser als akzeptabel sein",
		path: ["tolerable"],
	});

export async function updateRiskSettings(
	input: unknown,
): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = riskSettingsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				riskScales: orgSettings.riskScales,
				riskAppetite: orgSettings.riskAppetite,
				allowSelfApproval: orgSettings.allowSelfApproval,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({
				riskScales: { likelihood: d.likelihood, impact: d.impact },
				riskAppetite: { acceptable: d.acceptable, tolerable: d.tolerable },
				allowSelfApproval: d.allowSelfApproval,
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.risk",
				target: `organization:${c.orgId}`,
				before: before ?? null,
				after: {
					riskAppetite: { acceptable: d.acceptable, tolerable: d.tolerable },
					allowSelfApproval: d.allowSelfApproval,
				},
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/risiken", "layout");
	return { ok: true, data: undefined };
}

const numberingSchema = z.object({
	numbering: z.record(
		z.string(),
		z.object({
			prefix: z.string().regex(/^[A-Z]{1,5}$/, "1–5 Grossbuchstaben"),
			next: z.coerce.number().int().min(1).max(99999),
		}),
	),
});

export async function updateNumbering(input: unknown): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = numberingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const allowed = new Set(Object.keys(DEFAULT_PREFIXES));
	const numbering = Object.fromEntries(
		Object.entries(parsed.data.numbering).filter(([k]) => allowed.has(k)),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({ documentNumbering: orgSettings.documentNumbering })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		await tx
			.update(orgSettings)
			.set({ documentNumbering: numbering })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.numbering",
				target: `organization:${c.orgId}`,
				before: before?.documentNumbering ?? null,
				after: numbering,
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}
