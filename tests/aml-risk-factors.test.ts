import { describe, expect, it } from "vitest";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	AML_FACTORS,
	applicableAmlFactors,
	suggestDimensionScore,
} from "@/lib/compliance/catalog/aml-risk-factors";
import { amlRiskAnalysisSchema } from "@/lib/validation/casp";

describe("aml-risk-factors", () => {
	it("Codes eindeutig, je Dimension erhöhende und mindernde Faktoren", () => {
		const codes = AML_FACTORS.map((f) => f.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const f of AML_FACTORS) {
			expect(f.code).toMatch(/^AF-[A-Z]-\d{2}$/);
			for (const fw of f.frameworks ?? [])
				expect(FRAMEWORK_BY_SLUG.has(fw)).toBe(true);
		}
		for (const dim of ["customer", "product", "country", "channel"] as const) {
			const list = AML_FACTORS.filter((f) => f.dimension === dim);
			expect(list.some((f) => f.direction === "higher")).toBe(true);
			expect(list.some((f) => f.direction === "lower")).toBe(true);
		}
	});

	it("Krypto-Faktoren nur bei MiCAR/TFR", () => {
		const plain = applicableAmlFactors(["gwg"]).map((f) => f.code);
		expect(plain).not.toContain("AF-P-05");
		const crypto = applicableAmlFactors(["gwg", "micar"]).map((f) => f.code);
		expect(crypto).toContain("AF-P-05");
		expect(crypto).toContain("AF-P-06");
	});

	it("Vorschlag: Ausgangswert 2, Faktoren heben, starker Faktor mindestens 4", () => {
		expect(suggestDimensionScore("customer", []).score).toBe(2);
		expect(suggestDimensionScore("customer", ["AF-C-02"]).score).toBe(3);
		expect(suggestDimensionScore("customer", ["AF-C-01"]).score).toBe(4);
		expect(
			suggestDimensionScore("customer", ["AF-C-01", "AF-C-02", "AF-C-05"])
				.score,
		).toBe(5);
		expect(suggestDimensionScore("customer", ["AF-C-08"]).score).toBe(1);
		// mindernde Faktoren zählen zusammen höchstens −1
		expect(
			suggestDimensionScore("customer", ["AF-C-02", "AF-C-08", "AF-C-09"])
				.score,
		).toBe(2);
		// fremde Dimension wird ignoriert
		expect(suggestDimensionScore("product", ["AF-C-01"]).score).toBe(2);
	});

	it("Schema nimmt angekreuzte Faktoren an", () => {
		const dim = { factors: "", score: 4, factorCodes: ["AF-C-01"] };
		const ok = amlRiskAnalysisSchema.safeParse({
			dimensions: { customer: dim, product: dim, country: dim, channel: dim },
		});
		expect(ok.success).toBe(true);
		const bad = amlRiskAnalysisSchema.safeParse({
			dimensions: {
				customer: { ...dim, factorCodes: ["<script>"] },
				product: dim,
				country: dim,
				channel: dim,
			},
		});
		expect(bad.success).toBe(false);
	});
});
