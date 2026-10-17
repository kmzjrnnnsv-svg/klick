import {
	boolean,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { pk, updatedAt, userRef } from "./_shared";
import { PRICE_LEVELS, PRICE_MODES } from "./enums";

// Preise (Plattform, ohne Org-Bezug, kein RLS — Zugriff über lib/db/global.ts,
// Pflege nur durch Plattform-Admins). Preisgruppen nach Unternehmensgröße:
// je Gruppe eine Stufe (Einstieg/Marktüblich/Premium) oder eigene Werte;
// Organisationen werden über org_settings.priceGroupId zugeordnet, ohne
// Zuordnung gilt die Standardgruppe.

export const priceGroups = pgTable("price_groups", {
	id: pk(),
	slug: text().notNull().unique(),
	name: text().notNull(),
	description: text(),
	level: text({ enum: PRICE_LEVELS }).notNull().default("market"),
	isDefault: boolean().notNull().default(false),
	sortOrder: integer().notNull().default(0),
	updatedAt: updatedAt(),
	updatedByUserId: userRef(),
});

// Eigene Werte je Position; ohne Zeile gilt der Stufenwert.
export const priceOverrides = pgTable(
	"price_overrides",
	{
		id: pk(),
		groupId: uuid()
			.notNull()
			.references(() => priceGroups.id, { onDelete: "cascade" }),
		itemKey: text().notNull(),
		mode: text({ enum: PRICE_MODES }).notNull().default("from"),
		// ganze Euro, netto
		amount: integer(),
		unit: text(),
	},
	(t) => [unique().on(t.groupId, t.itemKey)],
);

export type PriceGroup = typeof priceGroups.$inferSelect;
export type PriceOverride = typeof priceOverrides.$inferSelect;
