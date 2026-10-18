"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import * as p from "@/lib/db/pricing";
import { withPlatform } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	assignPriceGroupSchema,
	priceGroupSchema,
} from "@/lib/validation/pricing";

// Preis-CMS (Plattform-Admin): Preisgruppen mit Stufe oder eigenen Werten,
// Standardgruppe für /preise und /leistungen, Zuordnung je Organisation.

function revalidatePrices() {
	revalidatePath("/preise");
	revalidatePath("/leistungen");
	revalidatePath("/admin/preise");
	revalidatePath("/admin/orgs");
}

const snapshot = async (id: string) => {
	const group = await p.getPriceGroup(id);
	if (!group) return null;
	const overrides = await p.listPriceOverrides(id);
	return {
		name: group.name,
		slug: group.slug,
		level: group.level,
		isDefault: group.isDefault,
		overrides: overrides.map((o) => ({
			itemKey: o.itemKey,
			mode: o.mode,
			amount: o.amount,
			unit: o.unit,
		})),
	};
};

async function savePriceGroupImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const admin = await requirePlatformAdmin();
	const parsed = priceGroupSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const data = parsed.data;
	const taken = (await p.listPriceGroups()).some(
		(r) => r.group.slug === data.slug && r.group.id !== data.id,
	);
	if (taken)
		return {
			ok: false,
			error: "Kürzel schon vergeben",
			fieldErrors: { slug: ["Kürzel schon vergeben"] },
		};
	const before = data.id ? await snapshot(data.id) : null;
	if (data.id && !before) return { ok: false, error: "Gruppe nicht gefunden" };
	const group = await p.savePriceGroup(data, admin.userId);
	if (!group) return { ok: false, error: "Gruppe nicht gefunden" };
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: before ? "pricing.group_updated" : "pricing.group_created",
			target: `price_group:${group.id}`,
			before,
			after: await snapshot(group.id),
		},
	);
	revalidatePrices();
	return { ok: true, data: { id: group.id } };
}

async function setDefaultPriceGroupImpl(id: string): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Gruppe nicht gefunden" };
	const group = await p.getPriceGroup(id);
	if (!group) return { ok: false, error: "Gruppe nicht gefunden" };
	const previous = (await p.listPriceGroups()).find((r) => r.group.isDefault);
	await p.setDefaultPriceGroup(id);
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "pricing.default_changed",
			target: `price_group:${id}`,
			before: previous ? { defaultGroup: previous.group.slug } : null,
			after: { defaultGroup: group.slug },
		},
	);
	revalidatePrices();
	return { ok: true, data: undefined };
}

async function deletePriceGroupImpl(id: string): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Gruppe nicht gefunden" };
	const before = await snapshot(id);
	if (!before) return { ok: false, error: "Gruppe nicht gefunden" };
	if (before.isDefault)
		return {
			ok: false,
			error: "Die Standardgruppe lässt sich nicht löschen.",
		};
	const assigned = await withPlatform(
		{
			userId: admin.userId,
			reason: "Admin: Preisgruppe löschen (Zuordnungen prüfen)",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		async (tx) =>
			[...(await p.orgPriceGroupIds(tx)).values()].filter((g) => g === id)
				.length,
	);
	if (assigned > 0)
		return {
			ok: false,
			error: `Noch ${assigned} Organisation${assigned === 1 ? "" : "en"} zugeordnet — erst umhängen.`,
		};
	await p.deletePriceGroup(id);
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "pricing.group_deleted",
			target: `price_group:${id}`,
			before,
		},
	);
	revalidatePrices();
	return { ok: true, data: undefined };
}

async function assignPriceGroupImpl(input: unknown): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	const parsed = assignPriceGroupSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { orgId, groupId } = parsed.data;
	if (groupId && !(await p.getPriceGroup(groupId)))
		return { ok: false, error: "Gruppe nicht gefunden" };
	const result = await withPlatform(
		{
			userId: admin.userId,
			reason: "Admin: Preisgruppe zuordnen",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		async (tx) => {
			const before = (await p.orgPriceGroupIds(tx)).get(orgId);
			if (before === undefined) return null;
			await p.assignOrgPriceGroup(tx, orgId, groupId);
			return { before };
		},
	);
	if (!result)
		return {
			ok: false,
			error: "Organisation hat noch kein Onboarding abgeschlossen.",
		};
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "pricing.org_assigned",
			target: `organization:${orgId}`,
			before: { priceGroupId: result.before },
			after: { priceGroupId: groupId },
		},
	);
	revalidatePath("/admin/orgs");
	revalidatePath("/admin/preise");
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

export const savePriceGroup = safeAction("savePriceGroup", savePriceGroupImpl);
export const setDefaultPriceGroup = safeAction(
	"setDefaultPriceGroup",
	setDefaultPriceGroupImpl,
);
export const deletePriceGroup = safeAction(
	"deletePriceGroup",
	deletePriceGroupImpl,
);
export const assignPriceGroup = safeAction(
	"assignPriceGroup",
	assignPriceGroupImpl,
);
