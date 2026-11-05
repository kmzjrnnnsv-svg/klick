"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { ISMS_ITEM_BY_KEY } from "@/lib/compliance/catalog/isms-programme";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import {
	type IsmsItemAdjust,
	ismsPlanSettingsOf,
	itemAdjustOf,
	storedIsmsPlan,
	withItemAdjust,
} from "@/lib/isms-plan/adjust";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	ismsItemAdjustSchema,
	ismsWorkdaysSchema,
} from "@/lib/validation/isms-plan";

// ISMS-Jahresplan je Org (P2b): was in der Org entfällt, eigener Aufwand,
// Einheiten und Arbeitstage. Nur die Anpassung wird gespeichert, der Plan
// selbst wird immer aus der Vorlage neu gerechnet.

const PATH = "/jahresplan";

async function settingsRow(tx: OrgTx, orgId: string) {
	const [row] = await tx
		.select({ ismsPlan: orgSettings.ismsPlan })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.for("update")
		.limit(1);
	return row;
}

async function saveIsmsPlanItemImpl(
	input: unknown,
): Promise<ActionResult<{ key: string }>> {
	const c = await requireOrg({ obligation: ["update"] });
	const parsed = ismsItemAdjustSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const item = ISMS_ITEM_BY_KEY.get(d.key);
	if (!item) return { ok: false, error: "notFound" };
	// gleiche Regeln wie beim Lesen: was nicht gilt, fällt weg
	const adjust: IsmsItemAdjust | null = itemAdjustOf(item, {
		off: d.off ? { reason: d.offReason } : undefined,
		year:
			d.yearMin !== undefined && d.yearMax !== undefined
				? [d.yearMin, d.yearMax]
				: undefined,
		units: d.units,
	});
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const row = await settingsRow(tx, c.orgId);
		if (!row) return { result: false, audit: [] };
		const settings = ismsPlanSettingsOf(row.ismsPlan);
		const before = settings.items[d.key] ?? null;
		const next = withItemAdjust(settings, d.key, adjust);
		await tx
			.update(orgSettings)
			.set({ ismsPlan: storedIsmsPlan(next) })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: true,
			audit: {
				action: adjust ? "isms_plan.item_adjusted" : "isms_plan.item_reset",
				target: `isms_plan:${d.key}`,
				before: before as Record<string, unknown> | null,
				after: adjust as Record<string, unknown> | null,
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: { key: d.key } };
}

async function saveIsmsPlanWorkdaysImpl(
	input: unknown,
): Promise<ActionResult<{ workdays: number }>> {
	const c = await requireOrg({ obligation: ["update"] });
	const parsed = ismsWorkdaysSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { workdays } = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const row = await settingsRow(tx, c.orgId);
		if (!row) return { result: false, audit: [] };
		const settings = ismsPlanSettingsOf(row.ismsPlan);
		await tx
			.update(orgSettings)
			.set({ ismsPlan: storedIsmsPlan({ ...settings, workdays }) })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: true,
			audit: {
				action: "isms_plan.workdays_changed",
				target: `organization:${c.orgId}`,
				before: { workdays: settings.workdays },
				after: { workdays },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: { workdays } };
}

export const saveIsmsPlanItem = safeAction(
	"saveIsmsPlanItem",
	saveIsmsPlanItemImpl,
);
export const saveIsmsPlanWorkdays = safeAction(
	"saveIsmsPlanWorkdays",
	saveIsmsPlanWorkdaysImpl,
);
