"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlImplementations, controls, controlTests } from "@/db/schema";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { planTestSchema } from "@/lib/validation/governance";

// Jahres-Testprogramm (ISO 27001 9.1, DORA Art. 24–26, NIS2 Art. 21(2)(f)):
// Tests planen (plannedAt); das Ergebnis wird später über recordControlTest
// am Control eingetragen.
export async function planControlTest(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = planTestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<string | null>(toOrgCtx(c), async (tx) => {
		const [impl] = await tx
			.select({ id: controlImplementations.id, code: controls.code })
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.id, d.implementationId),
					eq(controlImplementations.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!impl) return { result: null, audit: [] };
		const [row] = await tx
			.insert(controlTests)
			.values({
				organizationId: c.orgId,
				implementationId: impl.id,
				method: d.method,
				scope: d.scope ?? null,
				plannedAt: d.plannedAt,
				processId: d.processId ?? null,
				assetId: d.assetId ?? null,
				testerUserId: c.userId,
			})
			.returning({ id: controlTests.id });
		if (!row) throw new Error("insert failed");
		return {
			result: row.id,
			audit: {
				action: "control.test_planned",
				target: `control:${impl.id}`,
				after: {
					code: impl.code,
					method: d.method,
					plannedAt: d.plannedAt,
					scope: d.scope ?? null,
				},
			},
		};
	});
	revalidatePath("/testprogramm");
	revalidatePath("/controls", "layout");
	return res
		? { ok: true, data: { id: res } }
		: { ok: false, error: "notFound" };
}
