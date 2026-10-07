import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { checkSod, SOD_RULES } from "@/lib/compliance/catalog/sod-rules";

describe("SOD_RULES", () => {
	it("referenzieren nur bekannte Funktionen und sind eindeutig", () => {
		const fns = new Set<string>(ROLE_FUNCTIONS);
		for (const r of SOD_RULES) {
			expect(fns.has(r.a)).toBe(true);
			expect(fns.has(r.b)).toBe(true);
			expect(r.a).not.toBe(r.b);
		}
		expect(new Set(SOD_RULES.map((r) => r.code)).size).toBe(SOD_RULES.length);
	});
});

describe("checkSod", () => {
	it("ISB, der zugleich Interne Revision ist, verletzt eine Block-Regel", () => {
		const v = checkSod([
			{ function: "isb_ciso", userId: "anna" },
			{ function: "internal_audit", userId: "anna" },
			{ function: "management_body", userId: "ben" },
		]);
		expect(v).toHaveLength(1);
		expect(v[0]?.rule.severity).toBe("block");
		expect(v[0]?.userId).toBe("anna");
	});
	it("Geschäftsleitung als GWB ist nur eine Warnung", () => {
		const v = checkSod([
			{ function: "management_body", userId: "ben" },
			{ function: "aml_officer", userId: "ben" },
		]);
		expect(v.map((x) => x.rule.severity)).toEqual(["warn"]);
	});
	it("getrennte Besetzung und unbesetzte Funktionen erzeugen keine Verletzung", () => {
		expect(
			checkSod([
				{ function: "isb_ciso", userId: "anna" },
				{ function: "internal_audit", userId: "carl" },
				{ function: "dpo", userId: null },
			]),
		).toHaveLength(0);
	});
	it("Datenschutzbeauftragte Person in der Geschäftsleitung ist blockiert", () => {
		const v = checkSod([
			{ function: "dpo", userId: "ben" },
			{ function: "management_body", userId: "ben" },
		]);
		expect(v[0]?.rule.code).toBe("SOD-07");
	});
});
