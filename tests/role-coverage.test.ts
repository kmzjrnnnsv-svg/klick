import { describe, expect, it } from "vitest";
import {
	REQUIRED_FUNCTIONS,
	requiredFunctions,
	roleCoverage,
} from "@/lib/compliance/catalog/required-functions";
import {
	nextResolutionNumber,
	requiredResolutions,
	resolutionCoverage,
} from "@/lib/compliance/catalog/resolutions-required";

describe("requiredFunctions", () => {
	it("ISO-only in Stufe 0: Leitung, ISB, Vorfall-Manager, BCM, Revision — keine AML-/Compliance-Funktionen", () => {
		const fns = requiredFunctions(["iso27001"], "0_vorbereitung").map(
			(f) => f.function,
		);
		expect(fns).toContain("management_body");
		expect(fns).toContain("isb_ciso");
		expect(fns).toContain("incident_manager");
		expect(fns).not.toContain("aml_officer");
		expect(fns).not.toContain("compliance");
		// Interne Revision erst ab Stufe 2 (ISO verlangt interne Audits, aber keine Pflichtfunktion in Stufe 0)
		expect(fns).not.toContain("internal_audit");
	});

	it("CASP-Org in Stufe 2 mit DORA+MiCAR+GwG: fünf klassische Pflichtfunktionen offen", () => {
		const fns = requiredFunctions(
			["iso27001", "dora", "micar", "zag", "zag-marisk", "gwg"],
			"2_casp_zag",
		).map((f) => f.function);
		for (const f of [
			"management_body",
			"ict_risk_function",
			"compliance",
			"internal_audit",
			"aml_officer",
			"risk_control",
			"outsourcing_officer",
		])
			expect(fns).toContain(f);
	});

	it("Agent in Stufe 1 mit GwG: GWB und verantwortliches Leitungsmitglied, keine Compliance-Funktion nach MaRisk", () => {
		const fns = requiredFunctions(["gwg", "iso27001"], "1_agent").map(
			(f) => f.function,
		);
		expect(fns).toContain("aml_officer");
		expect(fns).toContain("compliance_manager");
		expect(fns).not.toContain("risk_control");
	});

	it("jede Pflichtfunktion nennt Rechtsgrundlage und mindestens ein Rahmenwerk", () => {
		for (const f of REQUIRED_FUNCTIONS) {
			expect(f.legalBasis.length).toBeGreaterThan(5);
			expect(f.frameworks.length).toBeGreaterThan(0);
		}
		expect(new Set(REQUIRED_FUNCTIONS.map((f) => f.function)).size).toBe(
			REQUIRED_FUNCTIONS.length,
		);
	});
});

describe("roleCoverage", () => {
	const required = requiredFunctions(["iso27001", "dora"], "0_vorbereitung");
	it("zählt unbesetzte Funktionen als Gap, erkennt fehlende Vertretung und abgelaufene Unterlagen", () => {
		const now = new Date("2026-10-07");
		const { items, gaps } = roleCoverage(
			required,
			[
				{
					function: "management_body",
					userId: "u1",
					externalName: null,
					deputyUserId: null,
					evidenceId: "e1",
					documentsValidUntil: "2026-01-01",
				},
				{
					function: "isb_ciso",
					userId: "u2",
					externalName: null,
					deputyUserId: null,
					evidenceId: null,
				},
				{
					function: "internal_audit",
					userId: null,
					externalName: "Revisions GmbH",
					deputyUserId: null,
					evidenceId: null,
				},
			],
			now,
		);
		const byFn = new Map(items.map((i) => [i.required.function, i]));
		expect(byFn.get("management_body")?.filled).toBe(true);
		expect(byFn.get("management_body")?.documentsExpired).toBe(true);
		expect(byFn.get("isb_ciso")?.deputyMissing).toBe(true);
		expect(byFn.get("isb_ciso")?.hasEvidence).toBe(false);
		expect(gaps.map((g) => g.required.function)).toContain("ict_risk_function");
		expect(gaps.map((g) => g.required.function)).not.toContain("isb_ciso");
	});
	it("externe Person zählt als besetzt (ausgelagerte Revision)", () => {
		const req = requiredFunctions(["zag-marisk"], "2_casp_zag");
		const { items } = roleCoverage(req, [
			{
				function: "internal_audit",
				userId: null,
				externalName: "Revisions GmbH",
				deputyUserId: null,
				evidenceId: "e9",
			},
		]);
		expect(
			items.find((i) => i.required.function === "internal_audit")?.filled,
		).toBe(true);
	});
});

describe("requiredResolutions / resolutionCoverage", () => {
	it("DORA verlangt Rahmen, Strategie, Budget, Drittparteien, BCP jährlich", () => {
		const codes = requiredResolutions(["dora"], "0_vorbereitung").map(
			(r) => r.code,
		);
		expect(codes).toEqual(
			expect.arrayContaining([
				"RES-DORA-FRAMEWORK",
				"RES-DORA-STRATEGY",
				"RES-DORA-BUDGET",
				"RES-DORA-TPR",
				"RES-DORA-BCP",
				"RES-RISK-APPETITE",
			]),
		);
		expect(codes).not.toContain("RES-GWG-RISK");
	});
	it("jährliche Beschlüsse veralten nach zwölf Monaten, einmalige nicht", () => {
		const now = new Date("2026-10-07");
		const req = requiredResolutions(["iso27001"], "0_vorbereitung");
		const { items, gaps } = resolutionCoverage(
			req,
			[
				{
					requiredCode: "RES-ISMS-SCOPE",
					date: "2024-01-15",
					resolutionNumber: "B-2024-001",
				},
				{
					requiredCode: "RES-ISMS-POLICY",
					date: "2025-06-01",
					resolutionNumber: "B-2025-002",
				},
				{
					requiredCode: "RES-RISK-APPETITE",
					date: "2026-03-01",
					resolutionNumber: "B-2026-001",
				},
			],
			now,
		);
		const by = new Map(items.map((i) => [i.required.code, i]));
		expect(by.get("RES-ISMS-SCOPE")?.satisfied).toBe(true);
		expect(by.get("RES-ISMS-POLICY")?.stale).toBe(true);
		expect(by.get("RES-ISMS-POLICY")?.satisfied).toBe(false);
		expect(by.get("RES-RISK-APPETITE")?.satisfied).toBe(true);
		expect(gaps.map((g) => g.required.code)).toContain("RES-MGMT-REVIEW");
	});
	it("Beschlussnummern laufen je Jahr fort", () => {
		expect(
			nextResolutionNumber(
				["B-2026-001", "B-2026-007", "B-2025-010"],
				new Date("2026-05-01"),
			),
		).toBe("B-2026-008");
		expect(nextResolutionNumber([], new Date("2027-01-01"))).toBe("B-2027-001");
	});
});
