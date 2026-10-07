import { describe, expect, it } from "vitest";
import {
	type CoverageInput,
	coverageDelta,
	deriveCoverage,
	rankByLeverage,
} from "@/lib/compliance/coverage";

// Mini-Katalog: zwei Rahmenwerke, fünf Anforderungen, drei Controls.
//   CC-A: iso:1 full, dora:1 full        (Hebel 2 Rahmenwerke)
//   CC-B: iso:2 partial, iso:3 full
//   CC-C: dora:2 full
//   iso:4 ohne Kante (Lücke), dora:3 nicht anwendbar
const input: CoverageInput = {
	frameworks: ["iso", "dora"],
	requirements: [
		{ framework: "iso", code: "1", domain: "governance", sectionCode: "A" },
		{ framework: "iso", code: "2", domain: "access", sectionCode: "A" },
		{ framework: "iso", code: "3", domain: "access", sectionCode: "B" },
		{ framework: "iso", code: "4", domain: "crypto", sectionCode: "B" },
		{ framework: "dora", code: "1", domain: "governance", sectionCode: "II" },
		{ framework: "dora", code: "2", domain: "incident", sectionCode: "III" },
		{ framework: "dora", code: "3", domain: "incident", sectionCode: "III" },
		{ framework: "other", code: "x", domain: "hr" },
	],
	applicability: { "dora:3": false },
	edges: [
		{ control: "CC-A", requirement: "iso:1", coverage: "full" },
		{ control: "CC-A", requirement: "dora:1", coverage: "full" },
		{ control: "CC-B", requirement: "iso:2", coverage: "partial" },
		{ control: "CC-B", requirement: "iso:3", coverage: "full" },
		{ control: "CC-C", requirement: "dora:2", coverage: "full" },
	],
	implStatus: { "CC-A": "implemented", "CC-B": "in_progress" },
};

describe("deriveCoverage", () => {
	const r = deriveCoverage(input);

	it("Status je Anforderung aus bester Kante × Control-Status", () => {
		expect(r.byRequirement.get("iso:1")).toBe("covered");
		expect(r.byRequirement.get("dora:1")).toBe("covered");
		expect(r.byRequirement.get("iso:2")).toBe("partial");
		expect(r.byRequirement.get("iso:3")).toBe("partial"); // in_progress
		expect(r.byRequirement.get("iso:4")).toBe("open"); // keine Kante
		expect(r.byRequirement.get("dora:2")).toBe("open"); // not_started
		expect(r.byRequirement.get("dora:3")).toBe("not_applicable");
		expect(r.byRequirement.has("other:x")).toBe(false); // nicht gewählt
	});

	it("Abdeckung je Rahmenwerk: coverage = covered/applicable, progress zählt partial halb", () => {
		const iso = r.byFramework.get("iso");
		expect(iso).toMatchObject({
			total: 4,
			applicable: 4,
			covered: 1,
			partial: 2,
			open: 1,
		});
		expect(iso?.coveragePct).toBe(25);
		expect(iso?.progressPct).toBe(50);
		const dora = r.byFramework.get("dora");
		expect(dora).toMatchObject({
			total: 3,
			applicable: 2,
			covered: 1,
			open: 1,
		});
		expect(dora?.coveragePct).toBe(50);
		expect(r.total.applicable).toBe(6);
	});

	it("Section- und Domänen-Heatmap", () => {
		expect(r.bySection.get("iso")?.get("A")).toMatchObject({
			covered: 1,
			partial: 1,
		});
		expect(r.byDomain.get("iso")?.get("crypto")).toMatchObject({ open: 1 });
		expect(r.byDomain.get("dora")?.get("incident")).toMatchObject({
			total: 2,
			applicable: 1,
		});
	});

	it("Hebel je Control zählt nur anwendbare Anforderungen und Rahmenwerke", () => {
		const a = r.leverage.get("CC-A");
		expect(a).toMatchObject({ requirements: 2, frameworks: 2, score: 2 });
		expect(r.leverage.get("CC-B")).toMatchObject({
			requirements: 2,
			frameworks: 1,
			score: 1.5,
		});
		expect(rankByLeverage(r.leverage)[0]?.control).toBe("CC-A");
	});

	it("leere Rahmenwerke liefern null statt NaN", () => {
		const e = deriveCoverage({ ...input, frameworks: ["none"] });
		expect(e.byFramework.get("none")?.coveragePct).toBeNull();
		expect(e.total.progressPct).toBeNull();
	});
});

describe("coverageDelta", () => {
	it("CC-B auf implemented: iso:3 wird erfüllt, iso:2 bleibt teilweise, ISO steigt 25 → 50", () => {
		const d = coverageDelta(input, "CC-B", "implemented");
		expect(d.affected).toEqual([
			{ key: "iso:3", before: "partial", after: "covered" },
		]);
		expect(d.frameworks.find((f) => f.framework === "iso")).toEqual({
			framework: "iso",
			before: 25,
			after: 50,
		});
		expect(d.frameworks.find((f) => f.framework === "dora")?.after).toBe(50);
	});

	it("CC-C auf implemented erfüllt dora:2 — ein Klick, ein Rahmenwerk", () => {
		const d = coverageDelta(input, "CC-C", "implemented");
		expect(d.affected.map((a) => a.key)).toEqual(["dora:2"]);
		expect(d.frameworks.find((f) => f.framework === "dora")?.after).toBe(100);
	});
});
