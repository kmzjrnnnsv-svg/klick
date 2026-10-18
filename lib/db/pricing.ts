import { and, asc, count, eq, notInArray, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { orgSettings, priceGroups, priceOverrides } from "@/db/schema";
import type { PriceLevel, PriceMode } from "@/db/schema/enums";
import type { PriceGroup } from "@/db/schema/pricing";
import { logger } from "@/lib/log";
import { SEED_PRICE_GROUPS } from "@/lib/pricing/presets";
import { type PriceTable, resolvePrices } from "@/lib/pricing/resolve";
import type { OrgTx } from "./with-org";

// Preisgruppen (Plattform-Tabellen ohne RLS). Lesen öffentlich (/preise,
// /leistungen) und je Org (Einstellungen → Abo); Schreiben nur über
// app/actions/pricing.ts (Plattform-Admin). Die Zuordnung Org → Gruppe steht
// in org_settings (RLS) und läuft deshalb über withPlatform bzw. readOrg.

export async function listPriceGroups() {
	const [groups, counts] = await Promise.all([
		globalDb
			.select()
			.from(priceGroups)
			.orderBy(asc(priceGroups.sortOrder), asc(priceGroups.name)),
		globalDb
			.select({ groupId: priceOverrides.groupId, n: count() })
			.from(priceOverrides)
			.groupBy(priceOverrides.groupId),
	]);
	const byGroup = new Map(counts.map((c) => [c.groupId, Number(c.n)]));
	return groups.map((group) => ({
		group,
		overrides: byGroup.get(group.id) ?? 0,
	}));
}

export async function getPriceGroup(id: string) {
	const [g] = await globalDb
		.select()
		.from(priceGroups)
		.where(eq(priceGroups.id, id))
		.limit(1);
	return g ?? null;
}

export async function listPriceOverrides(groupId: string) {
	return globalDb
		.select()
		.from(priceOverrides)
		.where(eq(priceOverrides.groupId, groupId));
}

async function defaultGroup() {
	const [g] = await globalDb
		.select()
		.from(priceGroups)
		.where(eq(priceGroups.isDefault, true))
		.limit(1);
	return g ?? null;
}

// Preise einer Gruppe (oder der Standardgruppe). Ohne Gruppen in der DB
// gilt die Stufe „Marktüblich“; ein DB-Fehler fällt ebenfalls darauf zurück,
// damit /preise nie auf der Fehlerseite landet.
export async function loadPriceTable(groupId?: string | null): Promise<{
	group: Pick<PriceGroup, "id" | "name" | "level"> | null;
	prices: PriceTable;
}> {
	try {
		const group =
			(groupId ? await getPriceGroup(groupId) : null) ?? (await defaultGroup());
		if (!group) return { group: null, prices: resolvePrices("market", []) };
		const overrides = await listPriceOverrides(group.id);
		return {
			group: { id: group.id, name: group.name, level: group.level },
			prices: resolvePrices(group.level, overrides),
		};
	} catch (err) {
		logger.warn({ err }, "price table fallback");
		return { group: null, prices: resolvePrices("market", []) };
	}
}

export type PriceGroupInput = {
	id?: string;
	slug: string;
	name: string;
	description: string | null;
	level: PriceLevel;
	sortOrder: number;
	overrides: readonly {
		itemKey: string;
		mode: PriceMode;
		amount: number | null;
		unit: string | null;
	}[];
};

// Gruppe mit allen Overrides in einer Transaktion: Positionen, die im
// Editor leer sind, fallen weg (dann gilt wieder der Stufenwert).
export async function savePriceGroup(input: PriceGroupInput, userId: string) {
	return globalDb.transaction(async (tx) => {
		const values = {
			slug: input.slug,
			name: input.name,
			description: input.description,
			level: input.level,
			sortOrder: input.sortOrder,
			updatedByUserId: userId,
		};
		const [group] = input.id
			? await tx
					.update(priceGroups)
					.set(values)
					.where(eq(priceGroups.id, input.id))
					.returning()
			: await tx.insert(priceGroups).values(values).returning();
		if (!group) return null;
		const keys = input.overrides.map((o) => o.itemKey);
		await tx
			.delete(priceOverrides)
			.where(
				keys.length > 0
					? and(
							eq(priceOverrides.groupId, group.id),
							notInArray(priceOverrides.itemKey, keys),
						)
					: eq(priceOverrides.groupId, group.id),
			);
		for (const o of input.overrides) {
			await tx
				.insert(priceOverrides)
				.values({ groupId: group.id, ...o })
				.onConflictDoUpdate({
					target: [priceOverrides.groupId, priceOverrides.itemKey],
					set: { mode: o.mode, amount: o.amount, unit: o.unit },
				});
		}
		return group;
	});
}

export async function setDefaultPriceGroup(id: string) {
	await globalDb.transaction(async (tx) => {
		await tx
			.update(priceGroups)
			.set({ isDefault: false })
			.where(eq(priceGroups.isDefault, true));
		await tx
			.update(priceGroups)
			.set({ isDefault: true })
			.where(eq(priceGroups.id, id));
	});
}

export async function deletePriceGroup(id: string) {
	await globalDb.delete(priceGroups).where(eq(priceGroups.id, id));
}

// Zuordnung Org → Gruppe. Nur innerhalb von withPlatform (Admin) aufrufen.
export async function orgPriceGroupIds(tx: OrgTx) {
	const rows = await tx
		.select({
			orgId: orgSettings.organizationId,
			groupId: orgSettings.priceGroupId,
		})
		.from(orgSettings);
	return new Map(rows.map((r) => [r.orgId, r.groupId]));
}

export async function assignOrgPriceGroup(
	tx: OrgTx,
	orgId: string,
	groupId: string | null,
) {
	const [row] = await tx
		.update(orgSettings)
		.set({ priceGroupId: groupId })
		.where(eq(orgSettings.organizationId, orgId))
		.returning({ orgId: orgSettings.organizationId });
	return Boolean(row);
}

// Seed: drei Startgruppen, nur wenn noch keine Gruppe existiert.
export async function seedPriceGroups(): Promise<number> {
	const [{ n } = { n: 0 }] = await globalDb
		.select({ n: sql<number>`count(*)::int` })
		.from(priceGroups);
	if (n > 0) return 0;
	const rows = await globalDb
		.insert(priceGroups)
		.values([...SEED_PRICE_GROUPS])
		.onConflictDoNothing({ target: priceGroups.slug })
		.returning({ id: priceGroups.id });
	return rows.length;
}
