import { describe, expect, it } from "vitest";
import { PRICE_ITEMS } from "@/lib/pricing/items";
import { PRESETS } from "@/lib/pricing/presets";
import { formatPrice, guidedFrom, resolvePrices } from "@/lib/pricing/resolve";

const NB = " ";

describe("Preise", () => {
	it("Stufen decken jede Position außer Lizenz ab und steigen", () => {
		for (const item of PRICE_ITEMS) {
			if (item.key === "plan:licence") continue;
			const e = PRESETS.entry[item.key] as number;
			const m = PRESETS.market[item.key] as number;
			const p = PRESETS.premium[item.key] as number;
			expect(e).toBeLessThan(m);
			expect(m).toBeLessThan(p);
		}
	});

	it("Stufenwert ohne Override, Lizenz auf Anfrage", () => {
		const t = resolvePrices("market", []);
		expect(t["svc:gap"]).toMatchObject({
			mode: "from",
			amount: 4900,
			source: "level",
		});
		expect(t["svc:cra"].unit).toBe("je Produkt");
		expect(t["plan:licence"]).toMatchObject({
			mode: "on_request",
			amount: null,
		});
	});

	it("Override vor Stufe; ohne Betrag gilt der Stufenwert", () => {
		const t = resolvePrices("entry", [
			{ itemKey: "svc:gap", mode: "fixed", amount: 3500, unit: null },
			{
				itemKey: "svc:pentest",
				mode: "fixed",
				amount: null,
				unit: " pauschal ",
			},
			{ itemKey: "plan:growth", mode: "on_request", amount: 999, unit: null },
			{ itemKey: "unbekannt", mode: "fixed", amount: 1, unit: null },
		]);
		expect(t["svc:gap"]).toMatchObject({
			mode: "fixed",
			amount: 3500,
			source: "override",
		});
		expect(t["svc:pentest"]).toMatchObject({
			mode: "fixed",
			amount: 4900,
			unit: "pauschal",
		});
		expect(t["plan:growth"]).toMatchObject({
			mode: "on_request",
			amount: null,
		});
		expect(Object.keys(t)).toHaveLength(PRICE_ITEMS.length);
	});

	it("Eigene Werte: fehlende Positionen auf Anfrage", () => {
		const t = resolvePrices("custom", [
			{ itemKey: "plan:start", mode: "from", amount: 250, unit: null },
			{ itemKey: "svc:gap", mode: "from", amount: null, unit: null },
		]);
		expect(t["plan:start"].amount).toBe(250);
		expect(t["svc:gap"]).toMatchObject({ mode: "on_request", amount: null });
		expect(t["svc:pentest"]).toMatchObject({
			mode: "on_request",
			source: "missing",
		});
	});

	it("Format", () => {
		expect(formatPrice({ mode: "from", amount: 4900, unit: null })).toBe(
			`ab 4.900${NB}€`,
		);
		expect(formatPrice({ mode: "fixed", amount: 290, unit: "im Monat" })).toBe(
			`290${NB}€ im Monat`,
		);
		expect(
			formatPrice(
				{ mode: "from", amount: 290, unit: "im Monat" },
				{ unit: false },
			),
		).toBe(`ab 290${NB}€`);
		expect(formatPrice({ mode: "on_request", amount: 5, unit: null })).toBe(
			"auf Anfrage",
		);
		expect(formatPrice({ mode: "from", amount: 12900, unit: null })).toBe(
			`ab 12.900${NB}€`,
		);
	});

	it("Begleitet ab: günstigste ganze Leistung, sonst je Einheit", () => {
		expect(guidedFrom(resolvePrices("market", []))).toMatchObject({
			mode: "from",
			amount: 1900,
		});
		const onlyUnit = resolvePrices("custom", [
			{ itemKey: "svc:suppliers", mode: "from", amount: 300, unit: null },
		]);
		expect(guidedFrom(onlyUnit).amount).toBe(300);
		expect(guidedFrom(resolvePrices("custom", [])).mode).toBe("on_request");
	});
});
