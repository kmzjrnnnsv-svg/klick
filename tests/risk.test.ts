import { describe, expect, it } from "vitest";
import {
	assessRisk,
	classDistribution,
	nextRiskCode,
	riskMatrix,
} from "@/lib/compliance/risk";
import {
	aggregate,
	classify,
	defaultRiskMethod,
	legacyRiskMethod,
} from "@/lib/compliance/risk-method";

const legacy = legacyRiskMethod(null, { acceptable: 4, tolerable: 9 });

describe("risk", () => {
	it("Bestand: EW × SH, Klassen und Zonen wie die früheren Bänder/Appetit", () => {
		expect(aggregate(4, 4, legacy)).toBe(16);
		expect(classify(4, legacy)).toMatchObject({
			label: "niedrig",
			zone: "acceptable",
		});
		expect(classify(9, legacy)).toMatchObject({
			label: "mittel",
			zone: "tolerable",
		});
		expect(classify(10, legacy)).toMatchObject({
			label: "hoch",
			zone: "unacceptable",
		});
		expect(classify(15, legacy)).toMatchObject({
			label: "kritisch",
			zone: "unacceptable",
		});
		const custom = legacyRiskMethod(null, { acceptable: 6, tolerable: 12 });
		expect(classify(12, custom).zone).toBe("tolerable");
	});

	it("klemmt Werte auf 1–5", () => {
		expect(aggregate(0, 9, legacy)).toBe(5);
		expect(aggregate(Number.NaN, 2, legacy)).toBe(6);
	});

	it("assessRisk: residual steuert, wenn vorhanden", () => {
		const a = assessRisk(
			{
				id: "r",
				likelihood: 4,
				impact: 4,
				residualLikelihood: 2,
				residualImpact: 3,
			},
			legacy,
		);
		expect(a.inherent.score).toBe(16);
		expect(a.inherent.zone).toBe("unacceptable");
		expect(a.residual?.score).toBe(6);
		expect(a.effective.zone).toBe("tolerable");
		expect(a.aboveAppetite).toBe(false);
		const b = assessRisk({ id: "r", likelihood: 4, impact: 4 }, legacy);
		expect(b.residual).toBeNull();
		expect(b.aboveAppetite).toBe(true);
	});

	it("Vorlage: EW + SH, drei Klassen (2–4 gering, 5–7 mittel, 8–10 hoch)", () => {
		const m = defaultRiskMethod(["iso27001"]);
		const a = assessRisk({ id: "r", likelihood: 3, impact: 5 }, m);
		expect(a.inherent.score).toBe(8);
		expect(a.inherent.cls.label).toBe("hoch");
		expect(a.aboveAppetite).toBe(true);
		expect(
			assessRisk({ id: "r", likelihood: 1, impact: 3 }, m).inherent.cls.label,
		).toBe("gering");
		expect(
			assessRisk({ id: "r", likelihood: 5, impact: 2 }, m).inherent.cls.label,
		).toBe("mittel");
	});

	it("Matrix: 5 Zeilen × 5 Spalten, Chips landen in der richtigen Zelle, Umschalter residual", () => {
		const risks = [
			{ id: "a", likelihood: 5, impact: 1 },
			{
				id: "b",
				likelihood: 4,
				impact: 4,
				residualLikelihood: 2,
				residualImpact: 3,
			},
		];
		const m = riskMatrix(risks, "inherent", legacy);
		expect(m).toHaveLength(5);
		expect(m[0]).toHaveLength(5);
		expect(m[0]?.[0]).toMatchObject({
			likelihood: 5,
			impact: 1,
			score: 5,
			riskIds: ["a"],
		});
		expect(m[1]?.[3]).toMatchObject({
			likelihood: 4,
			impact: 4,
			score: 16,
			zone: "unacceptable",
			riskIds: ["b"],
		});
		expect(m[1]?.[3]?.cls.label).toBe("kritisch");
		const r = riskMatrix(risks, "residual", legacy);
		expect(r[1]?.[3]?.riskIds).toEqual([]);
		expect(r[3]?.[2]?.riskIds).toEqual(["b"]); // L=2 → Zeile 3, I=3 → Spalte 2
		const sum = riskMatrix(risks, "inherent", defaultRiskMethod([]));
		expect(sum[1]?.[3]?.score).toBe(8);
	});

	it("Verteilung je Klasse vorher/nachher", () => {
		const m = defaultRiskMethod([]);
		const d = classDistribution(
			[
				{
					id: "a",
					likelihood: 5,
					impact: 5,
					residualLikelihood: 1,
					residualImpact: 2,
				},
				{ id: "b", likelihood: 3, impact: 3 },
			],
			m,
		);
		expect(d.map((x) => [x.label, x.inherent, x.residual])).toEqual([
			["gering", 0, 1],
			["mittel", 1, 1],
			["hoch", 1, 0],
		]);
	});

	it("nextRiskCode zählt hoch", () => {
		expect(nextRiskCode([])).toBe("R-001");
		expect(nextRiskCode(["R-001", "R-007", "X-9"])).toBe("R-008");
	});
});
