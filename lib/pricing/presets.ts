import type { PriceLevel } from "@/db/schema/enums";
import type { PriceItemKey } from "./items";

// Stufenwerte in ganzen Euro netto. Vorschlag zum Start; im Admin-CMS je
// Preisgruppe über eine andere Stufe oder eigene Werte änderbar. Fehlt eine
// Position (Software Lizenz, Beratung), steht sie „auf Anfrage“ — Beratung
// wird im Gespräch vereinbart. Software = Jahresgebühr (fällig nach
// bestandenem Audit), Berater-Zugang = je Zugang und Jahr ab Start.

export type PresetLevel = Exclude<PriceLevel, "custom">;

export const PRESETS: Record<
	PresetLevel,
	Partial<Record<PriceItemKey, number>>
> = {
	entry: {
		"plan:start": 1900,
		"plan:growth": 5900,
		"seat:consultant": 390,
	},
	market: {
		"plan:start": 2900,
		"plan:growth": 8900,
		"seat:consultant": 590,
	},
	premium: {
		"plan:start": 4900,
		"plan:growth": 14900,
		"seat:consultant": 890,
	},
};

export const LEVEL_LABEL: Record<PriceLevel, string> = {
	entry: "Einstieg",
	market: "Marktüblich",
	premium: "Premium",
	custom: "Eigene Werte",
};

export const presetAmount = (
	level: PriceLevel,
	key: PriceItemKey,
): number | null => (level === "custom" ? null : (PRESETS[level][key] ?? null));

// Startgruppen für `pnpm db:seed` (nur bei leerer Tabelle).
export const SEED_PRICE_GROUPS: readonly {
	slug: string;
	name: string;
	description: string;
	level: PriceLevel;
	isDefault: boolean;
	sortOrder: number;
}[] = [
	{
		slug: "standard",
		name: "Standard",
		description:
			"Gilt für alle Organisationen ohne eigene Zuordnung und öffentlich.",
		level: "market",
		isDefault: true,
		sortOrder: 0,
	},
	{
		slug: "klein",
		name: "Kleine Unternehmen",
		description: "Bis etwa 50 Beschäftigte oder 10 Mio. € Umsatz.",
		level: "entry",
		isDefault: false,
		sortOrder: 1,
	},
	{
		slug: "gross",
		name: "Große Unternehmen",
		description: "Ab etwa 250 Beschäftigten oder Konzernstrukturen.",
		level: "premium",
		isDefault: false,
		sortOrder: 2,
	},
];
