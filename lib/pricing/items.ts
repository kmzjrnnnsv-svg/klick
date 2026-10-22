import type { PriceMode } from "@/db/schema/enums";

// Preispositionen: Software (/preise), Berater-Zugänge und Beratung
// (/leistungen). Die Schlüssel sind stabil — Overrides in price_overrides
// hängen daran.
//
// Zahlungsmodell (Okt 2026): keine Monatszahlung. Die Software kostet eine
// Jahresgebühr, fällig erst nach einem bestandenen Audit (`after_audit`);
// Berater-Zugänge kosten ab dem ersten Tag (`from_start`); unsere Beratung
// wird im Gespräch vereinbart (`agreed`).

export type PriceDue = "after_audit" | "from_start" | "agreed";

export type PriceItem = {
	key: string;
	kind: "service" | "plan" | "seat";
	label: string;
	// Standard-Einheit, im CMS je Gruppe überschreibbar
	unit: string | null;
	mode: PriceMode;
	due: PriceDue;
};

export const PRICE_ITEMS = [
	{
		key: "svc:gap",
		kind: "service",
		label: "Gap-Analyse & Prüfungsreife",
		unit: null,
		mode: "on_request",
		due: "agreed",
	},
	{
		key: "svc:ai-check",
		kind: "service",
		label: "Security-Check für KI-gebaute Apps",
		unit: null,
		mode: "on_request",
		due: "agreed",
	},
	{
		key: "svc:cra",
		kind: "service",
		label: "CRA-Readiness",
		unit: "je Produkt",
		mode: "on_request",
		due: "agreed",
	},
	{
		key: "svc:suppliers",
		kind: "service",
		label: "Lieferantenprüfung für Software",
		unit: "je Lieferant",
		mode: "on_request",
		due: "agreed",
	},
	{
		key: "svc:pentest",
		kind: "service",
		label: "Penetrationstest",
		unit: null,
		mode: "on_request",
		due: "agreed",
	},
	{
		key: "plan:start",
		kind: "plan",
		label: "Software Start",
		unit: "im Jahr",
		mode: "from",
		due: "after_audit",
	},
	{
		key: "plan:growth",
		kind: "plan",
		label: "Software Wachstum",
		unit: "im Jahr",
		mode: "from",
		due: "after_audit",
	},
	{
		key: "plan:licence",
		kind: "plan",
		label: "Software Lizenz",
		unit: null,
		mode: "on_request",
		due: "after_audit",
	},
	{
		key: "seat:consultant",
		kind: "seat",
		label: "Berater-Zugang",
		unit: "je Zugang und Jahr",
		mode: "fixed",
		due: "from_start",
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
