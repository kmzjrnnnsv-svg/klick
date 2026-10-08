"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { orgSettings } from "@/db/schema";
import type { ApplicationItemState } from "@/db/schema/platform";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { MICAR_APPLICATION } from "@/lib/compliance/catalog/micar-application";
import { ZAG_APPLICATION } from "@/lib/compliance/catalog/zag-application";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";

const schema = z.object({
	code: z.string().min(2).max(10),
	done: z.boolean(),
	note: z.string().trim().max(1000).optional(),
});

const KNOWN = new Set(
	[...MICAR_APPLICATION, ...ZAG_APPLICATION].map((i) => i.code),
);

// Manuelle Bestandteile der Antragsmappen (Unterlagen, die außerhalb der
// Plattform liegen) abhaken — mit Akteur und Zeit im Audit-Log.
async function setApplicationItemImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ organisation: ["update"] });
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { code, done, note } = parsed.data;
	if (!KNOWN.has(code)) return { ok: false, error: "unknownItem" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [s] = await tx
			.select({ state: orgSettings.applicationState })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		const before = s?.state ?? {};
		const next: Record<string, ApplicationItemState> = {
			...before,
			[code]: {
				done,
				note: note || undefined,
				at: new Date().toISOString(),
				by: c.userId,
			},
		};
		await tx
			.update(orgSettings)
			.set({ applicationState: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "application.item",
				target: `organization:${c.orgId}`,
				before: { [code]: before[code] ?? null },
				after: { [code]: next[code] },
			},
		};
	});
	revalidatePath("/antrag");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const setApplicationItem = safeAction(
	"setApplicationItem",
	setApplicationItemImpl,
);
