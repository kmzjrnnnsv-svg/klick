import { describe, expect, it } from "vitest";
import { RISK_CATEGORIES } from "@/db/schema/grc";
import { CONTROL_BY_CODE, FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	applicableScenarios,
	PROTECTION_GOALS,
	RISK_SCENARIOS,
	SCENARIO_GROUPS,
} from "@/lib/compliance/catalog/risk-scenarios";
import { DIMENSION_TEMPLATES } from "@/lib/compliance/risk-method";

describe("risk-scenarios", () => {
	it("Codes eindeutig, Verweise gültig", () => {
		const codes = RISK_SCENARIOS.map((s) => s.code);
		expect(new Set(codes).size).toBe(codes.length);
		const groups = new Set(SCENARIO_GROUPS.map((g) => g.key));
		const dims = new Set(DIMENSION_TEMPLATES.map((d) => d.key));
		for (const s of RISK_SCENARIOS) {
			expect(s.code).toMatch(/^RS-[A-Z]{3}-\d{2}$/);
			expect(groups.has(s.group)).toBe(true);
			expect(RISK_CATEGORIES).toContain(s.category);
			expect(s.frameworks.length).toBeGreaterThan(0);
			for (const f of s.frameworks)
				expect(FRAMEWORK_BY_SLUG.has(f), `${s.code} ${f}`).toBe(true);
			for (const c of s.controls)
				expect(CONTROL_BY_CODE.has(c), `${s.code} ${c}`).toBe(true);
			for (const d of s.dimensions)
				expect(dims.has(d), `${s.code} ${d}`).toBe(true);
			for (const g of s.protectionGoals) expect(PROTECTION_GOALS).toContain(g);
			expect(s.controls.length).toBeGreaterThan(0);
			expect(s.impactHint.length).toBeGreaterThan(20);
		}
		expect(RISK_SCENARIOS.length).toBeGreaterThanOrEqual(55);
	});

	it("ISO-only: Informationssicherheit, keine Krypto- oder AML-Szenarien", () => {
		const s = applicableScenarios(["iso27001"], "0_vorbereitung");
		const groups = new Set(s.map((x) => x.group));
		expect(groups.has("infosec")).toBe(true);
		expect(groups.has("crypto")).toBe(false);
		expect(groups.has("aml")).toBe(false);
		expect(groups.has("finance")).toBe(false);
	});

	it("CASP (Stufe 2): Krypto, AML, Travel Rule, Risikoinventur ab Stufe", () => {
		const fws = [
			"iso27001",
			"dora",
			"micar",
			"gwg",
			"tfr",
			"sanctions",
			"zag-marisk",
		];
		const s = applicableScenarios(fws, "2_casp_zag").map((x) => x.code);
		expect(s).toEqual(
			expect.arrayContaining([
				"RS-CRY-01",
				"RS-AML-03",
				"RS-FIN-02",
				"RS-TPR-02",
			]),
		);
		// Adressenausfall erst ab Stufe 3
		expect(s).not.toContain("RS-FIN-04");
		const early = applicableScenarios(fws, "0_vorbereitung").map((x) => x.code);
		expect(early).not.toContain("RS-FIN-02");
		expect(early).toContain("RS-CRY-01");
	});

	it("Bank (Stufe 4): Adressenausfall und Modellrisiko", () => {
		const s = applicableScenarios(["kwg", "dora"], "4_bank").map((x) => x.code);
		expect(s).toEqual(expect.arrayContaining(["RS-FIN-04", "RS-FIN-08"]));
	});

	it("NIS2: alle Gefahren und Auswirkung auf Dienstempfänger", () => {
		const s = applicableScenarios(["nis2"], "0_vorbereitung").map(
			(x) => x.code,
		);
		expect(s).toEqual(
			expect.arrayContaining(["RS-BCM-04", "RS-BCM-05", "RS-BCM-08"]),
		);
	});
});
