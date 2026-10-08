"use server";

import { revalidatePath } from "next/cache";
import type { EntityKind } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	insertResolution,
	type ResolutionCreated,
} from "@/lib/compliance/resolutions-service";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { resolutionSchema } from "@/lib/validation/governance";

// Beschlussregister (DORA Art. 5, MiCAR Art. 68, ZAG-MaRisk AT 4.2, GwG § 5):
// Jeder Beschluss ist ein Datensatz; standardmäßig läuft er durch den
// Workflow management_approval (Genehmigung durch das Leitungsorgan). Ohne
// aktiven Workflow gilt der Beschluss sofort — die Leitung dokumentiert selbst.
async function createResolutionImpl(
	input: unknown,
): Promise<ActionResult<ResolutionCreated>> {
	const c = await requireOrg({ resolution: ["create"] });
	const parsed = resolutionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<ResolutionCreated>>(
		toOrgCtx(c),
		async (tx) => {
			const r = await insertResolution(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					...d,
					linkedEntityType: (d.linkedEntityType as EntityKind | null) ?? null,
				},
			);
			if (!r.ok) return { result: { ok: false, error: r.error }, audit: [] };
			return { result: { ok: true, data: r.data }, audit: r.audit };
		},
	);
	revalidatePath("/beschluesse");
	revalidatePath("/ueberblick");
	return res;
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const createResolution = safeAction(
	"createResolution",
	createResolutionImpl,
);
