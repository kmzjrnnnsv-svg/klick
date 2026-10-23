import { and, eq } from "drizzle-orm";
import { controlImplementations, controls } from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Umsetzungszeile eines Controls der Org; Controls außerhalb des
// Arbeitsvorrats bekommen beim ersten Eintrag eine Zeile
export async function implementationFor(
	tx: OrgTx,
	orgId: string,
	code: string,
): Promise<{ id: string; sheet: ControlSheetState } | null> {
	const [ctl] = await tx
		.select({ id: controls.id })
		.from(controls)
		.where(eq(controls.code, code))
		.limit(1);
	if (!ctl) return null;
	const [row] = await tx
		.select({
			id: controlImplementations.id,
			sheet: controlImplementations.sheet,
		})
		.from(controlImplementations)
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controlImplementations.controlId, ctl.id),
			),
		)
		.limit(1);
	if (row) return { id: row.id, sheet: row.sheet ?? {} };
	const [created] = await tx
		.insert(controlImplementations)
		.values({ organizationId: orgId, controlId: ctl.id, source: "manual" })
		.returning({ id: controlImplementations.id });
	return created ? { id: created.id, sheet: {} } : null;
}
