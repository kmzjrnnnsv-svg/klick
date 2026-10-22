import type { PriceLevel, PriceMode } from "@/db/schema/enums";
import type { PriceOverride } from "@/db/schema/pricing";
import { isPriceItemKey, PRICE_ITEMS, type PriceItemKey } from "./items";
import { presetAmount } from "./presets";

// Preise einer Gruppe auflösen: eigener Wert vor Stufenwert. Bei Stufe
// „Eigene Werte“ gelten nur die Overrides; was fehlt, steht „auf Anfrage“.
// Ein Override ohne Betrag übernimmt den Stufenwert (nur Art/Einheit ändern).

export type ResolvedPrice = {
	key: PriceItemKey;
	mode: PriceMode;
	amount: number | null;
	unit: string | null;
	source: "level" | "override" | "missing";
};

export type PriceTable = Record<PriceItemKey, ResolvedPrice>;

export type OverrideInput = Pick<
	PriceOverride,
	"itemKey" | "mode" | "amount" | "unit"
>;

export function resolvePrices(
	level: PriceLevel,
	overrides: readonly OverrideInput[],
): PriceTable {
	const byKey = new Map(
		overrides
			.filter((o) => isPriceItemKey(o.itemKey))
			.map((o) => [o.itemKey, o]),
	);
	const out = {} as PriceTable;
	for (const item of PRICE_ITEMS) {
		const base = presetAmount(level, item.key);
		const o = byKey.get(item.key);
		if (o) {
			const amount = o.mode === "on_request" ? null : (o.amount ?? base);
			out[item.key] = {
				key: item.key,
				mode: amount === null ? "on_request" : o.mode,
				amount,
				unit: o.unit?.trim() ? o.unit.trim() : item.unit,
				source: "override",
			};
			continue;
		}
		const mode: PriceMode = base === null ? "on_request" : item.mode;
		out[item.key] = {
			key: item.key,
			mode,
			amount: mode === "on_request" ? null : base,
			unit: item.unit,
			source: base === null && level === "custom" ? "missing" : "level",
		};
	}
	return out;
}

const NUMBER = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
export const euro = (amount: number) => `${NUMBER.format(amount)} €`;

// „ab 2.900 € im Jahr“, „590 € je Zugang und Jahr“, „auf Anfrage“. Ohne
// Einheit für Stellen, die die Einheit selbst setzen (Karten auf /preise).
export function formatPrice(
	p: Pick<ResolvedPrice, "mode" | "amount" | "unit">,
	opts: { unit?: boolean } = {},
): string {
	if (p.mode === "on_request" || p.amount === null) return "auf Anfrage";
	const value = p.mode === "from" ? `ab ${euro(p.amount)}` : euro(p.amount);
	return opts.unit !== false && p.unit ? `${value} ${p.unit}` : value;
}
