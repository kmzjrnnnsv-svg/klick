import { describe, expect, it } from "vitest";
import {
	appetiteZone,
	assessRisk,
	nextRiskCode,
	riskBand,
	riskMatrix,
	riskScore,
} from "@/lib/compliance/risk";

describe("risk", () => {
	it("Score, Bänder, Appetit", () => {
		expect(riskScore(4, 4)).toBe(16);
		expect(riskBand(4)).toBe("low");
		expect(riskBand(5)).toBe("medium");
		expect(riskBand(10)).toBe("high");
		expect(riskBand(15)).toBe("critical");
		expect(appetiteZone(4)).toBe("acceptable");
		expect(appetiteZone(9)).toBe("tolerable");
		expect(appetiteZone(10)).toBe("unacceptable");
		expect(appetiteZone(12, { acceptable: 6, tolerable: 12 })).toBe(
			"tolerable",
		);
	});

	it("klemmt Werte auf 1–5", () => {
		expect(riskScore(0, 9)).toBe(5);
		expect(riskScore(Number.NaN, 2)).toBe(6);
	});

	it("assessRisk: residual steuert, wenn vorhanden", () => {
		const a = assessRisk({
			id: "r",
			likelihood: 4,
			impact: 4,
			residualLikelihood: 2,
			residualImpact: 3,
		});
		expect(a.inherent.score).toBe(16);
		expect(a.inherent.zone).toBe("unacceptable");
		expect(a.residual?.score).toBe(6);
		expect(a.effective.zone).toBe("tolerable");
		expect(a.aboveAppetite).toBe(false);
		const b = assessRisk({ id: "r", likelihood: 4, impact: 4 });
		expect(b.residual).toBeNull();
		expect(b.aboveAppetite).toBe(true);
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
		const m = riskMatrix(risks);
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
			band: "critical",
			riskIds: ["b"],
		});
		const r = riskMatrix(risks, "residual");
		expect(r[1]?.[3]?.riskIds).toEqual([]);
		expect(r[3]?.[2]?.riskIds).toEqual(["b"]); // L=2 → Zeile 3, I=3 → Spalte 2
	});

	it("nextRiskCode zählt hoch", () => {
		expect(nextRiskCode([])).toBe("R-001");
		expect(nextRiskCode(["R-001", "R-007", "X-9"])).toBe("R-008");
	});
});
