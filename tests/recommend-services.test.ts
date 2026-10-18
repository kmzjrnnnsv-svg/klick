import { describe, expect, it } from "vitest";
import {
	type RecommendInput,
	recommendServices,
} from "@/lib/marketing/recommend";
import { SERVICES } from "@/lib/marketing/services";

const NOW = new Date("2026-10-18T10:00:00Z");
const base: RecommendInput = {
	frameworks: [],
	gapAnalysisCompleted: true,
	lastPentestAt: null,
	products: 0,
	productsWithoutSbom: 0,
	suppliersDue: 0,
	quickCheckFindings: 0,
	now: NOW,
};

describe("recommendServices", () => {
	it("ohne Anlass keine Empfehlung", () => {
		expect(recommendServices(base)).toEqual([]);
	});

	it("höchstens drei, Gap-Analyse zuerst, nur bekannte Leistungen", () => {
		const recs = recommendServices({
			...base,
			frameworks: ["iso27001", "nis2", "cra"],
			gapAnalysisCompleted: false,
			products: 2,
			productsWithoutSbom: 1,
			suppliersDue: 4,
			quickCheckFindings: 3,
		});
		expect(recs.map((r) => r.service)).toEqual(["gap", "cra", "pentest"]);
		for (const r of recs)
			expect(SERVICES.some((s) => s.key === r.service)).toBe(true);
	});

	it("Pentest: nie oder älter als zwölf Monate, nur bei passenden Rahmenwerken", () => {
		expect(
			recommendServices({ ...base, frameworks: ["dora"] })[0]?.reason,
		).toEqual({ key: "noPentest" });
		expect(
			recommendServices({
				...base,
				frameworks: ["dora"],
				lastPentestAt: new Date("2025-08-01T00:00:00Z"),
			})[0]?.reason,
		).toEqual({ key: "pentestOld", months: 14 });
		expect(
			recommendServices({
				...base,
				frameworks: ["dora"],
				lastPentestAt: new Date("2026-03-01T00:00:00Z"),
			}),
		).toEqual([]);
		expect(recommendServices({ ...base, frameworks: ["gwg"] })).toEqual([]);
	});

	it("Lieferanten nur mit NIS2/DORA, CRA ohne Produkte", () => {
		expect(
			recommendServices({
				...base,
				frameworks: ["iso27001"],
				lastPentestAt: NOW,
				suppliersDue: 3,
			}),
		).toEqual([]);
		expect(
			recommendServices({
				...base,
				frameworks: ["nis2", "cra"],
				lastPentestAt: NOW,
				suppliersDue: 3,
			}).map((r) => r.reason),
		).toEqual([{ key: "craNoProducts" }, { key: "suppliersDue", n: 3 }]);
	});
});
