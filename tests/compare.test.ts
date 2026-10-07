import { describe, expect, it } from "vitest";
import { ALL_REQUIREMENTS } from "@/lib/compliance/catalog";
import {
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
	profileApplicability,
} from "@/lib/compliance/catalog-view";
import {
	type CompareCatalog,
	compareFrameworks,
} from "@/lib/compliance/compare";

// Mini-Katalog: A hat 4 Anforderungen, B 3.
//   CC-1: a:1 full, b:1 full        → equivalent
//   CC-2: a:2 full, b:2 partial     → partial
//   CC-3: a:3 full                  → a:3 unique
//   a:4 ↔ b:3 nur per Querverweis   → equivalent (explizit)
const catalog: CompareCatalog = {
	requirements: [
		{ framework: "a", code: "1", domain: "governance" },
		{ framework: "a", code: "2", domain: "access" },
		{ framework: "a", code: "3", domain: "incident" },
		{ framework: "a", code: "4", domain: "compliance" },
		{ framework: "b", code: "1", domain: "governance" },
		{ framework: "b", code: "2", domain: "access" },
		{ framework: "b", code: "3", domain: "compliance" },
		{ framework: "b", code: "9", domain: "hr" },
	],
	edges: [
		{ control: "CC-1", requirement: "a:1", coverage: "full" },
		{ control: "CC-1", requirement: "b:1", coverage: "full" },
		{ control: "CC-2", requirement: "a:2", coverage: "full" },
		{ control: "CC-2", requirement: "b:2", coverage: "partial" },
		{ control: "CC-3", requirement: "a:3", coverage: "full" },
		{ control: "CC-4", requirement: "b:9", coverage: "full" },
	],
	related: new Map([["a:4", ["b:3"]]]),
};

describe("compareFrameworks", () => {
	it("klassifiziert equivalent / partial / unique und findet uniqueB", () => {
		const r = compareFrameworks("a", "b", catalog);
		const byCode = Object.fromEntries(r.rows.map((x) => [x.code, x]));
		expect(byCode["1"]?.kind).toBe("equivalent");
		expect(byCode["1"]?.counterparts.map((c) => c.code)).toEqual(["1"]);
		expect(byCode["2"]?.kind).toBe("partial");
		expect(byCode["3"]?.kind).toBe("unique");
		expect(byCode["4"]?.kind).toBe("equivalent");
		expect(byCode["4"]?.counterparts[0]?.via).toEqual([]);
		expect(r.uniqueB.map((x) => x.code)).toEqual(["9"]);
		expect(r.sharedControls).toEqual(["CC-1", "CC-2"]);
		expect(r.onlyA).toEqual(["CC-3"]);
		expect(r.onlyB).toEqual(["CC-4"]);
		expect(r.counts).toEqual({
			equivalent: 2,
			partial: 1,
			unique: 1,
			uniqueB: 1,
		});
	});

	it("Anwendbarkeit filtert, Org-Status färbt", () => {
		const r = compareFrameworks(
			"a",
			"b",
			{ ...catalog, applicability: new Map([["a:3", false]]) },
			new Map([["CC-1", "implemented"]]),
		);
		expect(r.rows.map((x) => x.code)).toEqual(["1", "2", "4"]);
		expect(r.rows[0]?.status).toBe("covered");
		expect(r.rows[1]?.status).toBe("open");
	});

	it("Realer Katalog: ISO ↔ DORA hat viele Äquivalenzen, GwG ↔ AMLR am Stichtag", () => {
		const related = new Map<string, readonly string[]>();
		for (const r of ALL_REQUIREMENTS)
			if (r.relatedRequirements?.length)
				related.set(`${r.framework}:${r.code}`, r.relatedRequirements);
		const base = {
			requirements: CATALOG_REQ_REFS,
			edges: CATALOG_EDGES,
			related,
		};
		const isoDora = compareFrameworks("iso27001", "dora", base);
		expect(isoDora.counts.equivalent).toBeGreaterThan(30);
		expect(isoDora.sharedControls.length).toBeGreaterThan(40);
		// Businessplan 17.6: DORA-Pflichten, die ISO nicht abdeckt — Controls, die
		// nur DORA braucht (Meldung, TLPT, Informationsregister, CTPP …)
		expect(isoDora.onlyB.length).toBeGreaterThan(3);
		expect(isoDora.onlyB).toContain("CC-TST-02");
		expect(isoDora.rows.some((r) => r.kind === "partial")).toBe(true);

		const today = profileApplicability({
			sector: "casp",
			licenceStage: "2_casp_zag",
			caspServices: ["transfer", "custody"],
			frameworks: ["gwg", "amlr"],
			asOf: new Date("2026-10-07"),
		});
		const future = profileApplicability({
			sector: "casp",
			licenceStage: "2_casp_zag",
			caspServices: ["transfer", "custody"],
			frameworks: ["gwg", "amlr"],
			asOf: new Date("2027-08-01"),
		});
		const now = compareFrameworks("gwg", "amlr", {
			...base,
			applicability: today,
		});
		const later = compareFrameworks("gwg", "amlr", {
			...base,
			applicability: future,
		});
		// heute: AMLR noch nicht in Kraft → keine B-Anforderungen
		expect(now.uniqueB.length).toBe(0);
		expect(now.rows.length).toBe(17);
		// Stichtag: GwG-Teile mit effectiveUntil fallen weg, AMLR erscheint
		expect(later.rows.length).toBeLessThan(now.rows.length);
		expect(later.rows.length + later.uniqueB.length).toBeGreaterThan(0);
		expect(later.rows.some((r) => r.kind === "equivalent")).toBe(true);
	});
});
