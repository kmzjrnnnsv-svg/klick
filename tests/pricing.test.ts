import { describe, expect, it } from "vitest";
import {
	BILLING_FAQ,
	BILLING_TERMS,
	withSeatPrice,
} from "@/lib/marketing/billing";
import { PRICE_ITEM_BY_KEY, PRICE_ITEMS } from "@/lib/pricing/items";
import { PRESETS } from "@/lib/pricing/presets";
import { formatPrice, resolvePrices } from "@/lib/pricing/resolve";

const NB = " ";

describe("Preise", () => {
	it("Stufen decken Software und Berater-Zugang ab und steigen", () => {
		for (const item of PRICE_ITEMS) {
			if (item.kind === "service" || item.key === "plan:licence") continue;
			const e = PRESETS.entry[item.key] as number;
			const m = PRESETS.market[item.key] as number;
			const p = PRESETS.premium[item.key] as number;
			expect(e).toBeLessThan(m);
			expect(m).toBeLessThan(p);
		}
	});

	it("Zahlungsmodell: Software nach Audit, Berater-Zugang ab Start, Beratung im Gespräch", () => {
		for (const item of PRICE_ITEMS) {
			if (item.kind === "plan") expect(item.due, item.key).toBe("after_audit");
			if (item.kind === "seat") expect(item.due, item.key).toBe("from_start");
			if (item.kind === "service") expect(item.due, item.key).toBe("agreed");
			// keine Monatspreise mehr
			expect(item.unit ?? "", item.key).not.toMatch(/Monat/);
		}
	});

	it("Stufenwert ohne Override; Lizenz und Beratung auf Anfrage", () => {
		const t = resolvePrices("market", []);
		expect(t["plan:start"]).toMatchObject({
			mode: "from",
			amount: 2900,
			unit: "im Jahr",
			source: "level",
		});
		expect(t["seat:consultant"]).toMatchObject({
			mode: "fixed",
			amount: 590,
			unit: "je Zugang und Jahr",
		});
		expect(t["svc:cra"]).toMatchObject({
			mode: "on_request",
			amount: null,
			unit: "je Produkt",
		});
		expect(t["plan:licence"]).toMatchObject({
			mode: "on_request",
			amount: null,
		});
	});

	it("Override vor Stufe; ohne Betrag gilt der Stufenwert", () => {
		const t = resolvePrices("entry", [
			{ itemKey: "svc:gap", mode: "fixed", amount: 3500, unit: null },
			{
				itemKey: "plan:start",
				mode: "fixed",
				amount: null,
				unit: " im Jahr, pauschal ",
			},
			{ itemKey: "plan:growth", mode: "on_request", amount: 999, unit: null },
			{ itemKey: "unbekannt", mode: "fixed", amount: 1, unit: null },
		]);
		expect(t["svc:gap"]).toMatchObject({
			mode: "fixed",
			amount: 3500,
			source: "override",
		});
		expect(t["plan:start"]).toMatchObject({
			mode: "fixed",
			amount: 1900,
			unit: "im Jahr, pauschal",
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
		expect(formatPrice({ mode: "fixed", amount: 590, unit: "im Jahr" })).toBe(
			`590${NB}€ im Jahr`,
		);
		expect(
			formatPrice(
				{ mode: "from", amount: 2900, unit: "im Jahr" },
				{ unit: false },
			),
		).toBe(`ab 2.900${NB}€`);
		expect(formatPrice({ mode: "on_request", amount: 5, unit: null })).toBe(
			"auf Anfrage",
		);
		expect(formatPrice({ mode: "from", amount: 12900, unit: null })).toBe(
			`ab 12.900${NB}€`,
		);
	});

	it("Abrechnungs-Texte zeigen nur bekannte Positionen und den Zugangspreis", () => {
		for (const term of BILLING_TERMS)
			if (term.price) expect(PRICE_ITEM_BY_KEY.has(term.price)).toBe(true);
		const seat = BILLING_FAQ.find((f) => f.a.includes("{seat}"));
		expect(seat).toBeDefined();
		expect(withSeatPrice(seat?.a ?? "", "590 €")).toContain("590 € je Zugang");
		expect(withSeatPrice(seat?.a ?? "", "590 €")).not.toContain("{seat}");
	});
});
