import { describe, expect, it } from "vitest";
import {
	ISMS_ITEM_BY_KEY,
	ISMS_PROGRAMME,
	ISMS_WORKDAYS,
} from "@/lib/compliance/catalog/isms-programme";
import {
	applyIsmsPlan,
	ismsPlanSettingsOf,
	itemAdjustOf,
	storedIsmsPlan,
	withItemAdjust,
} from "@/lib/isms-plan/adjust";
import { adjustedNumbers, unitsLine } from "@/lib/isms-plan/adjust-math";
import { rollupIsms } from "@/lib/isms-plan/rollup";
import { ismsItemAdjustSchema } from "@/lib/validation/isms-plan";
import de from "@/messages/de.json";

// ISMS-Jahresplan je Org (P2b): Anpassungen lesen, rechnen, entfallen lassen

const item = (key: string) => {
	const i = ISMS_ITEM_BY_KEY.get(key);
	if (!i) throw new Error(key);
	return i;
};

describe("ismsPlanSettingsOf", () => {
	it("Unsinn ergibt die Vorlage", () => {
		for (const raw of [null, undefined, 3, "x", [], { items: [] }])
			expect(ismsPlanSettingsOf(raw)).toEqual({
				workdays: ISMS_WORKDAYS,
				items: {},
			});
	});

	it("verwirft fremde Punkte, kaputte Spannen, kurze Begründungen", () => {
		const s = ismsPlanSettingsOf({
			workdays: 999,
			items: {
				nope: { year: [1, 2] },
				policy: { year: [3, 1] },
				soa: { year: [-1, 2] },
				physical: { off: { reason: "kurz" } },
				bcm: {
					off: { reason: "  Kein eigener Betrieb, alles beim Konzern.  " },
				},
				risk_analyses: { units: 12 },
				management_review: { units: 3, year: [4, 5.55] },
			},
		});
		expect(s.workdays).toBe(ISMS_WORKDAYS);
		expect(Object.keys(s.items).sort()).toEqual([
			"bcm",
			"management_review",
			"risk_analyses",
		]);
		expect(s.items.bcm?.off?.reason).toBe(
			"Kein eigener Betrieb, alles beim Konzern.",
		);
		// Einheiten nur, wo die Vorlage Einheiten zählt; Zehntel gerundet
		expect(s.items.management_review).toEqual({ year: [4, 5.6] });
		expect(s.items.risk_analyses).toEqual({ units: 12 });
	});

	it("Arbeitstage nur in den Grenzen", () => {
		expect(ismsPlanSettingsOf({ workdays: 210 }).workdays).toBe(210);
		expect(ismsPlanSettingsOf({ workdays: 100 }).workdays).toBe(ISMS_WORKDAYS);
		expect(ismsPlanSettingsOf({ workdays: 210.5 }).workdays).toBe(
			ISMS_WORKDAYS,
		);
	});

	it("speichern und zurücksetzen", () => {
		const base = ismsPlanSettingsOf({});
		const a = withItemAdjust(base, "policy", { year: [1, 2] });
		expect(a.items.policy).toEqual({ year: [1, 2] });
		expect(storedIsmsPlan(a)).toEqual({ items: { policy: { year: [1, 2] } } });
		const b = withItemAdjust(a, "policy", null);
		expect(b.items).toEqual({});
		expect(storedIsmsPlan({ ...b, workdays: 210 })).toEqual({
			workdays: 210,
			items: {},
		});
		// gespeichert und gelesen ergibt dasselbe
		expect(ismsPlanSettingsOf(storedIsmsPlan(a))).toEqual(a);
	});
});

describe("adjustedNumbers", () => {
	it("ohne Anpassung die Vorlage", () => {
		const i = item("policy");
		expect(adjustedNumbers(i, null)).toEqual({
			year: i.year,
			isbA: i.isb.a,
			isbB: i.isb.b,
		});
	});

	it("Einheiten rechnen den Aufwand um, ISB im Verhältnis", () => {
		const i = item("risk_analyses");
		expect(unitsLine(i.basis)?.units).toBe(8);
		// 4 Analysen mehr × 3–5 PT
		expect(adjustedNumbers(i, { units: 12 })).toEqual({
			year: [36, 60],
			isbA: [18, 30],
			isbB: [36, 60],
		});
		expect(adjustedNumbers(i, { units: 1 }).year).toEqual([3, 5]);
	});

	it("eigener Aufwand geht vor den Einheiten", () => {
		const i = item("risk_analyses");
		expect(adjustedNumbers(i, { units: 12, year: [10, 20] })).toEqual({
			year: [10, 20],
			isbA: [5, 10],
			isbB: [10, 20],
		});
	});

	it("ISB-Anteil liegt nie über dem Aufwand", () => {
		for (const i of ISMS_PROGRAMME) {
			for (const year of [
				[0, 0],
				[0.5, 1],
				[50, 80],
			] as const) {
				const n = adjustedNumbers(i, { year });
				expect(n.isbA[0]).toBeLessThanOrEqual(year[0]);
				expect(n.isbA[1]).toBeLessThanOrEqual(year[1]);
				expect(n.isbB[0]).toBeLessThanOrEqual(year[0]);
				expect(n.isbB[1]).toBeLessThanOrEqual(year[1]);
			}
		}
	});
});

describe("applyIsmsPlan", () => {
	it("ohne Anpassung dieselben Summen wie die Vorlage", () => {
		const plan = applyIsmsPlan(ISMS_PROGRAMME, ismsPlanSettingsOf({}));
		expect(rollupIsms(plan.active)).toEqual(rollupIsms(ISMS_PROGRAMME));
	});

	it("entfällt mit allen Unterpunkten und zählt nicht mehr", () => {
		const settings = ismsPlanSettingsOf({
			items: {
				bcm: { off: { reason: "Notfallmanagement liegt beim Konzern." } },
			},
		});
		const plan = applyIsmsPlan(ISMS_PROGRAMME, settings);
		expect(plan.rows.get("bcm")?.off).toEqual({
			reason: "Notfallmanagement liegt beim Konzern.",
		});
		const kids = ISMS_PROGRAMME.filter((i) => i.parent === "bcm");
		expect(kids.length).toBeGreaterThan(0);
		for (const k of kids)
			expect(plan.rows.get(k.key)?.off).toEqual({ via: "bcm" });
		const gone = [item("bcm"), ...kids];
		expect(plan.active.length).toBe(ISMS_PROGRAMME.length - gone.length);
		const full = rollupIsms(ISMS_PROGRAMME).total.year;
		const less = rollupIsms(plan.active).total.year;
		const removed = gone.reduce(
			(acc, i) => [acc[0] + i.year[0], acc[1] + i.year[1]],
			[0, 0],
		);
		expect(less[0]).toBeCloseTo(full[0] - removed[0], 5);
		expect(less[1]).toBeCloseTo(full[1] - removed[1], 5);
	});

	it("angepasster Aufwand fließt in die Summe", () => {
		const plan = applyIsmsPlan(
			ISMS_PROGRAMME,
			ismsPlanSettingsOf({ items: { risk_analyses: { units: 12 } } }),
		);
		const full = rollupIsms(ISMS_PROGRAMME).total.year;
		expect(rollupIsms(plan.active).total.year).toEqual([
			full[0] + 12,
			full[1] + 20,
		]);
	});

	it("Arbeitstage ändern den Stellenanteil", () => {
		const r = rollupIsms(ISMS_PROGRAMME, { workdays: 220 });
		expect(r.fte.a[0]).toBeCloseTo(r.total.isbA[0] / 220, 5);
	});
});

describe("Eingabe", () => {
	it("verlangt Begründung beim Entfallen und eine stimmige Spanne", () => {
		expect(
			ismsItemAdjustSchema.safeParse({ key: "policy", off: true }).success,
		).toBe(false);
		expect(
			ismsItemAdjustSchema.safeParse({
				key: "policy",
				off: true,
				offReason: "Bei uns regelt das der Konzern.",
			}).success,
		).toBe(true);
		expect(
			ismsItemAdjustSchema.safeParse({ key: "policy", off: false, yearMin: 2 })
				.success,
		).toBe(false);
		expect(
			ismsItemAdjustSchema.safeParse({
				key: "policy",
				off: false,
				yearMin: 3,
				yearMax: 2,
			}).success,
		).toBe(false);
	});

	it("itemAdjustOf: leer = keine Anpassung", () => {
		expect(itemAdjustOf(item("policy"), {})).toBeNull();
		expect(itemAdjustOf(item("policy"), { units: 3 })).toBeNull();
	});

	it("alle Texte der Anpassung gibt es", () => {
		const keys = Object.keys(de.IsmsPlan);
		for (const k of [
			"adjust",
			"adjustTitle",
			"adjustOff",
			"adjustOffReason",
			"adjustOffReasonShort",
			"adjustUnits",
			"adjustYear",
			"adjustYearRange",
			"adjustPreview",
			"adjustReset",
			"adjusted",
			"templateValue",
			"offSelf",
			"offVia",
			"offCount",
			"stateOff",
			"workdays",
			"workdaysEdit",
		])
			expect(keys, k).toContain(k);
	});
});
