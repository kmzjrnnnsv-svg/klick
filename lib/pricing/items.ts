import type { PriceMode } from "@/db/schema/enums";

// Preispositionen: Beratungsleistungen (/leistungen) und Abos (/preise).
// Die Schlüssel sind stabil — Overrides in price_overrides hängen daran.

export type PriceItem = {
	key: string;
	kind: "service" | "plan";
	label: string;
	// Standard-Einheit, im CMS je Gruppe überschreibbar
	unit: string | null;
	mode: PriceMode;
};

export const PRICE_ITEMS = [
	{
		key: "svc:gap",
		kind: "service",
		label: "Gap-Analyse & Prüfungsreife",
		unit: null,
		mode: "from",
	},
	{
		key: "svc:ai-check",
		kind: "service",
		label: "Security-Check für KI-gebaute Apps",
		unit: null,
		mode: "from",
	},
	{
		key: "svc:cra",
		kind: "service",
		label: "CRA-Readiness",
		unit: "je Produkt",
		mode: "from",
	},
	{
		key: "svc:suppliers",
		kind: "service",
		label: "Lieferantenprüfung für Software",
		unit: "je Lieferant",
		mode: "from",
	},
	{
		key: "svc:pentest",
		kind: "service",
		label: "Penetrationstest",
		unit: null,
		mode: "from",
	},
	{
		key: "plan:start",
		kind: "plan",
		label: "Abo Start",
		unit: "im Monat",
		mode: "from",
	},
	{
		key: "plan:growth",
		kind: "plan",
		label: "Abo Wachstum",
		unit: "im Monat",
		mode: "from",
	},
	{
		key: "plan:licence",
		kind: "plan",
		label: "Abo Lizenz",
		unit: null,
		mode: "on_request",
	},
] as const satisfies readonly PriceItem[];

export type PriceItemKey = (typeof PRICE_ITEMS)[number]["key"];

export const PRICE_ITEM_KEYS = PRICE_ITEMS.map((i) => i.key) as [
	PriceItemKey,
	...PriceItemKey[],
];

export const PRICE_ITEM_BY_KEY = new Map<string, PriceItem>(
	PRICE_ITEMS.map((i) => [i.key, i]),
);

export const isPriceItemKey = (k: string): k is PriceItemKey =>
	PRICE_ITEM_BY_KEY.has(k);
