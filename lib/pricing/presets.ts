import type { PriceLevel } from "@/db/schema/enums";
import type { PriceItemKey } from "./items";

// Stufenwerte in ganzen Euro netto. Vorschlag zum Start; im Admin-CMS je
// Preisgruppe über eine andere Stufe oder eigene Werte änderbar. Fehlt eine
// Position (Abo Lizenz), steht sie „auf Anfrage“.

export type PresetLevel = Exclude<PriceLevel, "custom">;

export const PRESETS: Record<
	PresetLevel,
	Partial<Record<PriceItemKey, number>>
> = {
	entry: {
		"svc:gap": 2900,
		"svc:ai-check": 990,
		"svc:cra": 3900,
		"svc:suppliers": 190,
		"svc:pentest": 4900,
		"plan:start": 190,
		"plan:growth": 590,
	},
	market: {
		"svc:gap": 4900,
		"svc:ai-check": 1900,
		"svc:cra": 6900,
		"svc:suppliers": 390,
		"svc:pentest": 7900,
		"plan:start": 290,
		"plan:growth": 890,
	},
	premium: {
		"svc:gap": 7900,
		"svc:ai-check": 2900,
		"svc:cra": 9900,
		"svc:suppliers": 590,
		"svc:pentest": 12900,
		"plan:start": 490,
		"plan:growth": 1490,
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
