import { describe, expect, it } from "vitest";
import type { CatalogControlMapping } from "@/lib/compliance/catalog/types";
import {
	assignmentState,
	frameworkRefs,
	testOutcome,
	testTotal,
} from "@/lib/compliance/controls-register";
import type { ReqCoverage } from "@/lib/compliance/coverage";

const members = new Set(["u1", "u2"]);
const filled = new Set(["isb"]);

describe("Zuständigkeit je Control", () => {
	it("ohne Eintrag ist ohne Verantwortliche", () => {
		expect(
			assignmentState(
				{ ownerUserId: null, ownerFunction: null },
				members,
				filled,
			),
		).toBe("unassigned");
	});

	it("Person, die Mitglied ist, oder besetzte Funktion ist zugeordnet", () => {
		expect(
			assignmentState(
				{ ownerUserId: "u1", ownerFunction: null },
				members,
				filled,
			),
		).toBe("assigned");
		expect(
			assignmentState(
				{ ownerUserId: "u2", ownerFunction: "isb" },
				members,
				filled,
			),
		).toBe("assigned");
	});

	it("ausgeschiedene Person oder unbesetzte Funktion heißt neu zuordnen", () => {
		expect(
			assignmentState(
				{ ownerUserId: "alt", ownerFunction: null },
				members,
				filled,
			),
		).toBe("reassign");
		expect(
			assignmentState(
				{ ownerUserId: "u1", ownerFunction: "dpo" },
				members,
				filled,
			),
		).toBe("reassign");
		expect(
			assignmentState(
				{ ownerUserId: null, ownerFunction: "isb" },
				members,
				filled,
			),
		).toBe("reassign");
	});
});

describe("Tests je Control", () => {
	it("zählt und ordnet ein", () => {
		expect(testTotal(undefined)).toBe(0);
		expect(testOutcome(undefined)).toBe("none");
		expect(testOutcome({ pass: 0, partial: 0, fail: 0 })).toBe("none");
		expect(testOutcome({ pass: 2, partial: 0, fail: 0 })).toBe("passed");
		expect(testOutcome({ pass: 2, partial: 1, fail: 0 })).toBe("issues");
		expect(testOutcome({ pass: 0, partial: 0, fail: 1 })).toBe("issues");
		expect(testTotal({ pass: 2, partial: 1, fail: 1 })).toBe(4);
	});
});

describe("Bezüge zu den Rahmenwerken", () => {
	const edges: CatalogControlMapping[] = [
		{ control: "CC-ACC-01", requirement: "iso27001:A.5.15", coverage: "full" },
		{
			control: "CC-ACC-01",
			requirement: "iso27001:A.5.18",
			coverage: "partial",
		},
		{ control: "CC-ACC-01", requirement: "dora:9", coverage: "partial" },
		{ control: "CC-ACC-01", requirement: "nis2:30", coverage: "full" },
		{ control: "CC-ACC-01", requirement: "soc2:CC6.1", coverage: "full" },
	];
	const catalog = { edgesByControl: new Map([["CC-ACC-01", edges]]) };
	const byRequirement = new Map<string, ReqCoverage>([
		["iso27001:A.5.15", "open"],
		["iso27001:A.5.18", "covered"],
		["dora:9", "not_applicable"],
		["nis2:30", "partial"],
	]);

	it("nimmt nur anwendbare Anforderungen gewählter Rahmenwerke, in deren Reihenfolge", () => {
		expect(
			frameworkRefs("CC-ACC-01", catalog, byRequirement, [
				"nis2",
				"iso27001",
				"dora",
			]),
		).toEqual([
			{ framework: "nis2", codes: ["30"] },
			{ framework: "iso27001", codes: ["A.5.15", "A.5.18"] },
		]);
	});

	it("liefert nichts für ein Control ohne Kanten", () => {
		expect(
			frameworkRefs("CC-X-01", catalog, byRequirement, ["iso27001"]),
		).toEqual([]);
	});
});
