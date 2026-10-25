import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { CONTROLS } from "@/lib/compliance/catalog";
import {
	AREA_CANDIDATES,
	areaOf,
	RESPONSIBILITY_AREAS,
	suggestAreaFunction,
} from "@/lib/compliance/catalog/domain-functions";

describe("Bereich → Funktion (Einrichtung)", () => {
	it("jeder Bereich hat gültige, eindeutige Kandidaten", () => {
		for (const area of RESPONSIBILITY_AREAS) {
			const c = AREA_CANDIDATES[area];
			expect(c.length, area).toBeGreaterThan(0);
			expect(new Set(c).size, area).toBe(c.length);
			for (const f of c) expect(ROLE_FUNCTIONS).toContain(f);
		}
	});

	it("jedes Control im Katalog fällt in einen Bereich", () => {
		for (const c of CONTROLS) expect(RESPONSIBILITY_AREAS).toContain(areaOf(c));
	});

	it("Datenschutz-Controls gehören zur/zum DSB, nicht zu Compliance", () => {
		expect(areaOf({ code: "CC-PRV-01", domain: "compliance" })).toBe("privacy");
		expect(areaOf({ code: "CC-REG-01", domain: "compliance" })).toBe(
			"compliance",
		);
	});

	it("schlägt die erste besetzte Funktion vor, sonst nichts", () => {
		expect(suggestAreaFunction("access", new Set(["management_body"]))).toBe(
			"management_body",
		);
		expect(
			suggestAreaFunction("access", new Set(["management_body", "isb_ciso"])),
		).toBe("isb_ciso");
		expect(suggestAreaFunction("aml", new Set(["isb_ciso"]))).toBeNull();
	});
});
