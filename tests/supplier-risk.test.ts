import { describe, expect, it } from "vitest";
import {
	supplierImpactDimension,
	supplierRiskSuggestion,
} from "@/lib/compliance/supplier-risk";

describe("Risiko aus der Lieferantenbewertung", () => {
	it("rote Bewertung, kritisch, nicht ersetzbar = hoch", () => {
		const s = supplierRiskSuggestion(
			{
				ratingTraffic: "red",
				criticality: "critical",
				substitutability: "not_substitutable",
			},
			5,
		);
		expect(s).toEqual({
			likelihood: 4,
			impact: 5,
			because: ["traffic_red", "critical", "not_substitutable"],
		});
	});
	it("grüne Bewertung, normal = niedrig", () => {
		const s = supplierRiskSuggestion(
			{ ratingTraffic: "green", criticality: "standard" },
			5,
		);
		expect(s.likelihood).toBe(1);
		expect(s.impact).toBe(2);
	});
	it("ohne Bewertung kein Eintritt, Schaden aus der Kritikalität", () => {
		const s = supplierRiskSuggestion({ criticality: "important" }, 4);
		expect(s.likelihood).toBeNull();
		expect(s.impact).toBe(2);
	});
	it("gelb bei vier Stufen", () => {
		expect(
			supplierRiskSuggestion({ ratingTraffic: "amber" }, 4).likelihood,
		).toBe(2);
	});
	it("Schadensart Ausfall, sonst die erste aktive", () => {
		expect(
			supplierImpactDimension([
				{ key: "financial", enabled: true },
				{ key: "outage", enabled: true },
			]),
		).toBe("outage");
		expect(
			supplierImpactDimension([
				{ key: "outage", enabled: false },
				{ key: "legal", enabled: true },
			]),
		).toBe("legal");
		expect(supplierImpactDimension([])).toBeNull();
	});
});
