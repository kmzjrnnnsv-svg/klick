import { describe, expect, it } from "vitest";
import type { RiskMethod } from "@/db/schema/platform";
import {
	appetiteFromMethod,
	damageFrom,
	decisiveDimensions,
	defaultRiskMethod,
	legacyRiskMethod,
	methodChangePreview,
	rescaleClasses,
	resolveRiskMethod,
	templateDimensions,
	validateRiskMethod,
} from "@/lib/compliance/risk-method";
import { riskMethodSchema } from "@/lib/validation/risk-method";

describe("risk-method", () => {
	it("Vorlage: fünf Schadensarten für Informationssicherheit", () => {
		const keys = templateDimensions(["iso27001"]).map((d) => d.key);
		expect(keys).toEqual(["financial", "outage", "data", "legal", "image"]);
	});

	it("Schadensarten je Rahmenwerk: Banking/Krypto/Datenschutz", () => {
		const keys = templateDimensions([
			"iso27001",
			"dora",
			"micar",
			"gwg",
			"dsgvo",
		]).map((d) => d.key);
		expect(keys).toEqual(
			expect.arrayContaining([
				"customers",
				"clientAssets",
				"supervisory",
				"persons",
			]),
		);
		expect(templateDimensions(["nis2"]).map((d) => d.key)).toContain(
			"customers",
		);
		expect(templateDimensions(["nis2"]).map((d) => d.key)).not.toContain(
			"clientAssets",
		);
	});

	it("Vorlage ist gültig und schema-konform", () => {
		const m = defaultRiskMethod(["iso27001", "dora", "micar", "dsgvo"]);
		expect(validateRiskMethod(m)).toEqual([]);
		expect(riskMethodSchema.safeParse(m).success).toBe(true);
		expect(appetiteFromMethod(m)).toEqual({ acceptable: 4, tolerable: 7 });
	});

	it("Altmethode ist gültig und hält den Appetit", () => {
		const m = legacyRiskMethod(null, { acceptable: 4, tolerable: 9 });
		expect(validateRiskMethod(m)).toEqual([]);
		expect(appetiteFromMethod(m)).toEqual({ acceptable: 4, tolerable: 9 });
		const wide = legacyRiskMethod(null, { acceptable: 10, tolerable: 20 });
		expect(validateRiskMethod(wide)).toEqual([]);
		expect(wide.classes.map((c) => c.key)).toEqual([
			"low",
			"medium",
			"critical",
		]);
	});

	it("resolveRiskMethod: gespeicherte Methode vor Altwerten", () => {
		const stored = defaultRiskMethod([]);
		expect(resolveRiskMethod({ riskMethod: stored }).aggregation).toBe("sum");
		expect(
			resolveRiskMethod({
				riskMethod: null,
				riskAppetite: { acceptable: 4, tolerable: 9 },
			}).aggregation,
		).toBe("product");
	});

	it("Schadenshöhe = höchste aktive Schadensart", () => {
		const m = defaultRiskMethod([]);
		expect(damageFrom({ financial: 2, outage: 4, data: 1 }, m)).toBe(4);
		expect(
			decisiveDimensions({ financial: 2, outage: 4, data: 4 }, m).map(
				(d) => d.key,
			),
		).toEqual(["outage", "data"]);
		const off: RiskMethod = {
			...m,
			dimensions: m.dimensions.map((d) =>
				d.key === "outage" ? { ...d, enabled: false } : d,
			),
		};
		expect(damageFrom({ financial: 2, outage: 4 }, off)).toBe(2);
		expect(damageFrom({}, m)).toBeNull();
		expect(damageFrom(null, m)).toBeNull();
	});

	it("Validierung findet Lücken, Reihenfolge und Wertebereich", () => {
		const m = defaultRiskMethod([]);
		const gap: RiskMethod = {
			...m,
			classes: m.classes.map((c, i) => (i === 1 ? { ...c, min: 6 } : c)),
		};
		expect(validateRiskMethod(gap)).toContain("class_gap");
		const zones: RiskMethod = {
			...m,
			classes: m.classes.map((c, i) =>
				i === 2 ? { ...c, zone: "acceptable" } : c,
			),
		};
		expect(validateRiskMethod(zones)).toContain("zone_order");
		const range: RiskMethod = { ...m, aggregation: "product" };
		expect(validateRiskMethod(range)).toContain("class_range");
		const none: RiskMethod = {
			...m,
			dimensions: m.dimensions.map((d) => ({ ...d, enabled: false })),
		};
		expect(validateRiskMethod(none)).toContain("no_dimension");
		expect(riskMethodSchema.safeParse(gap).success).toBe(false);
	});

	it("Rechenweg wechseln streckt die Klassen lückenlos", () => {
		const m = defaultRiskMethod([]);
		const scaled = rescaleClasses(m.classes, "sum", "product");
		expect(scaled[0]?.min).toBe(1);
		expect(scaled.at(-1)?.max).toBe(25);
		expect(
			validateRiskMethod({ ...m, aggregation: "product", classes: scaled }),
		).toEqual([]);
		const back = rescaleClasses(scaled, "product", "sum");
		expect(validateRiskMethod({ ...m, classes: back })).toEqual([]);
	});

	it("Vorschau zählt Klassenwechsel", () => {
		const from = legacyRiskMethod(null, { acceptable: 4, tolerable: 9 });
		const to = defaultRiskMethod([]);
		const p = methodChangePreview(
			[
				{ likelihood: 1, impact: 1 }, // 1 niedrig → 2 gering
				{ likelihood: 2, impact: 5 }, // 10 hoch → 7 mittel
				{ likelihood: 3, impact: 2 }, // 6 mittel → 5 mittel
			],
			from,
			to,
		);
		expect(p.changed).toBe(2);
		expect(p.nowUnacceptable).toBe(0);
	});
});
