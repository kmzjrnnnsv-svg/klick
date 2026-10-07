import { describe, expect, it } from "vitest";
import {
	computeSynergy,
	prioritizePlan,
	type SynergyCatalog,
	whatIfAddFramework,
} from "@/lib/compliance/synergy";

// Mini-Katalog: drei Rahmenwerke.
//   CC-A (S): iso:1, dora:1, nis:1   — der grosse Hebel
//   CC-B (M): iso:2, iso:3
//   CC-C (L): dora:2 (partial), nis:2
//   CC-D (S): nis:3 — exklusiv NIS2
const catalog: SynergyCatalog = {
	requirements: [
		{ framework: "iso", code: "1", domain: "governance" },
		{ framework: "iso", code: "2", domain: "access" },
		{ framework: "iso", code: "3", domain: "access" },
		{ framework: "dora", code: "1", domain: "governance" },
		{ framework: "dora", code: "2", domain: "incident" },
		{ framework: "nis", code: "1", domain: "governance" },
		{ framework: "nis", code: "2", domain: "incident" },
		{ framework: "nis", code: "3", domain: "compliance" },
	],
	edges: [
		{ control: "CC-A", requirement: "iso:1", coverage: "full" },
		{ control: "CC-A", requirement: "dora:1", coverage: "full" },
		{ control: "CC-A", requirement: "nis:1", coverage: "full" },
		{ control: "CC-B", requirement: "iso:2", coverage: "full" },
		{ control: "CC-B", requirement: "iso:3", coverage: "full" },
		{ control: "CC-C", requirement: "dora:2", coverage: "partial" },
		{ control: "CC-C", requirement: "nis:2", coverage: "full" },
		{ control: "CC-D", requirement: "nis:3", coverage: "full" },
	],
	controls: [
		{ code: "CC-A", effort: "S" },
		{ code: "CC-B", effort: "M" },
		{ code: "CC-C", effort: "L" },
		{ code: "CC-D", effort: "S" },
	],
};

describe("computeSynergy", () => {
	it("ISO allein: 3 Anforderungen, 2 Controls, keine Überlappung", () => {
		const s = computeSynergy(["iso"], catalog);
		expect(s.requirementCount).toBe(3);
		expect(s.controlCount).toBe(2);
		expect(s.multiFrameworkControls).toBe(0);
		expect(s.overlapPct).toBeNull();
		expect(s.effortBuckets).toEqual({ S: 1, M: 1, L: 0 });
	});

	it("ISO + DORA + NIS2: 8 Anforderungen → 4 Controls, 2 davon mehrfach genutzt", () => {
		const s = computeSynergy(["iso", "dora", "nis"], catalog);
		expect(s.requirementCount).toBe(8);
		expect(s.controlCount).toBe(4);
		expect(s.multiFrameworkControls).toBe(2);
		expect(s.overlapPct).toBe(50);
		expect(s.perFramework.nis).toEqual({
			requirements: 3,
			controls: 3,
			exclusiveControls: 1,
			sharedControls: 2,
		});
		expect(s.perFramework.iso.exclusiveControls).toBe(1); // CC-B
	});

	it("Anwendbarkeit reduziert Anforderungen und Controls", () => {
		const s = computeSynergy(["nis"], {
			...catalog,
			applicability: new Map([["nis:3", false]]),
		});
		expect(s.requirementCount).toBe(2);
		expect(s.controlCount).toBe(2);
	});
});

describe("whatIfAddFramework", () => {
	it("ISO umgesetzt, NIS2 dazu: ein Control bereits abgedeckt, zwei neu", () => {
		const impl = new Map([
			["CC-A", "implemented" as const],
			["CC-B", "implemented" as const],
		]);
		const w = whatIfAddFramework(["iso"], "nis", catalog, impl);
		expect(w.candidateRequirements).toBe(3);
		expect(w.newControls).toEqual(["CC-C", "CC-D"]);
		expect(w.alreadyNeededControls).toBe(1);
		expect(w.alreadyCoveredPct).toBeCloseTo(33.3, 0);
	});
});

describe("prioritizePlan", () => {
	it("greedy nach Hebel/Aufwand: CC-A zuerst, kumulierte Kurve steigt", () => {
		const plan = prioritizePlan(["iso", "dora", "nis"], catalog);
		expect(plan.applicable).toBe(8);
		expect(plan.baselineCoveragePct).toBe(0);
		expect(plan.steps.map((s) => s.control)).toEqual([
			"CC-A",
			"CC-D",
			"CC-B",
			"CC-C",
		]);
		expect(plan.steps[0]).toMatchObject({
			gainCovered: 3,
			frameworks: ["dora", "iso", "nis"],
			cumulativeCoveragePct: 37.5,
		});
		const curve = plan.steps.map((s) => s.cumulativeCoveragePct);
		expect([...curve].sort((a, b) => a - b)).toEqual(curve);
		// CC-C erfüllt dora:2 nur teilweise → Coverage 7/8 = 87.5, Progress 7.5/8 = 93.8
		expect(plan.steps.at(-1)?.cumulativeCoveragePct).toBe(87.5);
		expect(plan.steps.at(-1)?.cumulativeProgressPct).toBe(93.8);
	});

	it("bereits umgesetzte Controls sind kein Schritt mehr", () => {
		const plan = prioritizePlan(
			["iso"],
			catalog,
			new Map([["CC-A", "implemented"]]),
		);
		expect(plan.baselineCoveragePct).toBeCloseTo(33.3, 0);
		expect(plan.steps.map((s) => s.control)).toEqual(["CC-B"]);
	});
});
