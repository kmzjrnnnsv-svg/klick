import { describe, expect, it } from "vitest";
import {
	applicabilityDelta,
	stageChangeReport,
} from "@/lib/compliance/stage-report";

describe("stage report", () => {
	it("applicabilityDelta: neu anwendbar, schon erfüllt, neue Controls mit Aufwand", () => {
		const r = applicabilityDelta({
			frameworks: ["x"],
			requirements: [
				{ framework: "x", code: "1", domain: "governance" },
				{ framework: "x", code: "2", domain: "aml" },
				{ framework: "x", code: "3", domain: "aml" },
				{ framework: "x", code: "4", domain: "custody" },
			],
			edges: [
				{ control: "CC-A", requirement: "x:1", coverage: "full" },
				{ control: "CC-A", requirement: "x:2", coverage: "full" },
				{ control: "CC-B", requirement: "x:3", coverage: "full" },
				{ control: "CC-C", requirement: "x:4", coverage: "partial" },
			],
			controls: [
				{ code: "CC-A", effort: "S" },
				{ code: "CC-B", effort: "L" },
				{ code: "CC-C", effort: "M" },
			],
			before: new Map([
				["x:2", false],
				["x:3", false],
				["x:4", false],
			]),
			after: new Map(),
			implStatus: new Map([["CC-A", "implemented"]]),
		});
		expect(r.applicableBefore).toBe(1);
		expect(r.applicableAfter).toBe(4);
		expect(r.newlyApplicable).toEqual(["x:2", "x:3", "x:4"]);
		expect(r.alreadyCovered).toBe(1); // x:2 über CC-A
		expect(r.newControls).toEqual(["CC-B", "CC-C"]);
		expect(r.effortBuckets).toEqual({ S: 0, M: 1, L: 1 });
		expect(r.coverageBeforePct).toBe(100);
		// x:1 und x:2 über CC-A erfüllt, x:3 und x:4 offen
		expect(r.coverageAfterPct).toBe(50);
	});

	it("Stufe 1 → 2 für eine CASP-Org: MiCAR-Institutspflichten werden anwendbar", () => {
		const base = {
			sector: "casp" as const,
			caspServices: ["transfer", "custody"] as const,
			frameworks: ["iso27001", "dora", "micar", "zag", "gwg"],
		};
		const r = stageChangeReport(
			{ ...base, licenceStage: "1_agent" },
			{ ...base, licenceStage: "2_casp_zag" },
			new Map([
				["CC-GOV-02", "implemented"],
				["CC-GOV-03", "implemented"],
			]),
		);
		expect(r.newlyApplicable.length).toBeGreaterThan(20);
		expect(r.newlyApplicable).toContain("micar:Art.67");
		expect(r.newlyApplicable).toContain("zag:§17");
		expect(r.noLongerApplicable).toEqual([]);
		expect(r.newControls).toContain("CC-CAP-01");
		expect(r.effortBuckets.S + r.effortBuckets.M + r.effortBuckets.L).toBe(
			r.newControls.length,
		);
		expect(r.applicableAfter).toBeGreaterThan(r.applicableBefore);
	});

	it("Stichtag 10.07.2027: GwG-Teile fallen weg, AMLR kommt", () => {
		const base = {
			sector: "casp" as const,
			licenceStage: "2_casp_zag" as const,
			caspServices: ["transfer"] as const,
			frameworks: ["gwg", "amlr"],
		};
		const r = stageChangeReport(
			{ ...base, asOf: new Date("2026-10-07") },
			{ ...base, asOf: new Date("2027-07-10") },
		);
		expect(r.newlyApplicable.every((k) => k.startsWith("amlr:"))).toBe(true);
		expect(r.newlyApplicable.length).toBe(7);
		expect(r.noLongerApplicable.every((k) => k.startsWith("gwg:"))).toBe(true);
		expect(r.noLongerApplicable.length).toBeGreaterThanOrEqual(8);
	});
});
