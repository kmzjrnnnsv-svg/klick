import { describe, expect, it } from "vitest";
import {
	assignmentColumns,
	functionKeyOf,
	functionLabel,
	isFunctionKey,
	isOwnRoleKey,
	ownRoleIdOf,
	ownRoleKey,
} from "@/lib/compliance/function-key";
import { buildOrgChart } from "@/lib/compliance/org-chart";
import { responsibleRef } from "@/lib/validation/responsible";

// Eigene Rollen als Funktion (ADR-024): Schlüssel `role:<id>` neben den
// Katalog-Funktionen — erkennen, zerlegen, anzeigen, im Organigramm.
const ID = "6f1d3c2a-9b8e-4c7d-a1f0-2e3b4c5d6e7f";

describe("Funktionsschlüssel", () => {
	it("erkennt Katalog-Funktionen und eigene Rollen", () => {
		expect(isFunctionKey("isb_ciso")).toBe(true);
		expect(isFunctionKey(ownRoleKey(ID))).toBe(true);
		expect(isFunctionKey("role:einkauf")).toBe(false);
		expect(isFunctionKey("ceo")).toBe(false);
		expect(isOwnRoleKey("isb_ciso")).toBe(false);
		expect(ownRoleIdOf(`role:${ID}`)).toBe(ID);
		expect(ownRoleIdOf("dpo")).toBeNull();
	});

	it("Besetzung ↔ Schlüssel", () => {
		expect(functionKeyOf({ function: "other", orgRoleId: ID })).toBe(
			`role:${ID}`,
		);
		expect(functionKeyOf({ function: "dpo", orgRoleId: null })).toBe("dpo");
		expect(assignmentColumns(`role:${ID}`)).toEqual({
			function: "other",
			orgRoleId: ID,
		});
		expect(assignmentColumns("dpo")).toEqual({
			function: "dpo",
			orgRoleId: null,
		});
	});

	it("zeigt eigene Rollen mit Namen, gelöschte als entfernt", () => {
		const catalog = (f: string) => `K:${f}`;
		expect(functionLabel("dpo", catalog, {})).toBe("K:dpo");
		expect(functionLabel(`role:${ID}`, catalog, { [ID]: "Einkauf" })).toBe(
			"Einkauf",
		);
		expect(functionLabel(`role:${ID}`, catalog, new Map(), "weg")).toBe("weg");
	});

	it("Verantwortlich nimmt eigene Rollen an, nur mit gültiger ID", () => {
		expect(responsibleRef.safeParse(`function:role:${ID}`).success).toBe(true);
		expect(responsibleRef.safeParse("function:role:einkauf").success).toBe(
			false,
		);
	});

	it("Organigramm: eigene Rolle unter einer Funktion, Katalog zuerst", () => {
		const chart = buildOrgChart([
			{
				function: "management_body",
				reportsToFunction: null,
				holder: "A",
				deputy: null,
			},
			{
				function: `role:${ID}`,
				reportsToFunction: "risk_control",
				holder: "C",
				deputy: null,
			},
			{
				function: "risk_control",
				reportsToFunction: null,
				holder: "B",
				deputy: null,
			},
		]);
		const top = chart.roots[0];
		expect(top?.function).toBe("management_body");
		const rc = top?.children.find((c) => c.function === "risk_control");
		expect(rc?.children.map((c) => c.function)).toEqual([`role:${ID}`]);
		expect(chart.warnings).toEqual([]);
	});
});
