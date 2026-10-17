import { z } from "zod";
import { PRICE_LEVELS, PRICE_MODES } from "@/db/schema/enums";
import { PRICE_ITEM_KEYS, PRICE_ITEMS } from "@/lib/pricing/items";
import { shortText, slug } from "./common";

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

export const priceOverrideSchema = z.object({
	itemKey: z.enum(PRICE_ITEM_KEYS),
	mode: z.enum(PRICE_MODES),
	// ganze Euro; leer = Stufenwert
	amount: z.number().int().min(0).max(10_000_000).nullable(),
	unit: optionalText(40),
});

export const priceGroupSchema = z.object({
	id: z.uuid().optional(),
	slug,
	name: shortText.max(80),
	description: optionalText(500),
	level: z.enum(PRICE_LEVELS),
	sortOrder: z.number().int().min(0).max(999),
	overrides: z
		.array(priceOverrideSchema)
		.max(PRICE_ITEMS.length)
		.refine(
			(list) => new Set(list.map((o) => o.itemKey)).size === list.length,
			"Position doppelt",
		),
});

export const assignPriceGroupSchema = z.object({
	orgId: z.uuid(),
	groupId: z.uuid().nullable(),
});
