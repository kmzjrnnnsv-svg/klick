import { describe, expect, it } from "vitest";
import { deriveApplicability } from "@/lib/compliance/applicability";
import {
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import { PCI_CODES, PCI_SP_ONLY } from "@/lib/compliance/catalog/pci-dss";
import {
	PCI_SAQ_REQUIREMENTS,
	PCI_VARIANTS,
} from "@/lib/compliance/catalog/pci-saq";
import { toProfile } from "@/lib/compliance/catalog-view";
import { exclusionRule } from "@/lib/compliance/exclusions";

// PCI DSS v4.0.1: alle Anforderungen, Anwendbarkeit je Nachweisweg (SAQ),
// Dienstleister-Anforderungen nur für Dienstleister, Ausschluss mit
// Begründung bei jeder Anforderung.

const pci = FRAMEWORK_BY_SLUG.get("pci-dss");

function applicable(code: string, variant?: string): boolean {
	const r = pci?.requirements.find((x) => x.code === code);
	expect(r, code).toBeDefined();
	const profile = toProfile({
		sector: "other",
		licenceStage: "0_vorbereitung",
		caspServices: [],
		frameworks: ["pci-dss"],
		frameworkVariants: variant ? { "pci-dss": variant } : undefined,
		asOf: new Date("2026-10-31"),
	});
	return deriveApplicability(
		{ framework: "pci-dss", code, variants: r?.variants },
		profile,
	).applicable;
}

describe("PCI DSS v4.0.1", () => {
	it("Codes eindeutig, alle Abschnitte, jede Anforderung mit Kante", () => {
		expect(new Set(PCI_CODES).size).toBe(PCI_CODES.length);
		expect(PCI_CODES.length).toBeGreaterThanOrEqual(250);
		for (const s of ["1", "6", "12", "A1", "A2"])
			expect(
				pci?.requirements.some((r) => r.sectionCode === s),
				s,
			).toBe(true);
		for (const c of ["3.5.1.1", "6.4.3", "11.6.1", "12.10.7", "8.4.2"])
			expect(PCI_CODES).toContain(c);
		for (const c of PCI_CODES)
			expect(EDGES_BY_REQUIREMENT.has(`pci-dss:${c}`), c).toBe(true);
	});

	it("Zuordnung je SAQ nennt nur echte Codes, Dienstleister-Anforderungen nur bei sp", () => {
		const all = new Set(PCI_CODES);
		expect(Object.keys(PCI_SAQ_REQUIREMENTS).sort()).toEqual(
			PCI_VARIANTS.map((v) => v.key).sort(),
		);
		for (const [k, codes] of Object.entries(PCI_SAQ_REQUIREMENTS)) {
			for (const c of codes) expect(all.has(c), `${k} ${c}`).toBe(true);
			if (k !== "sp")
				for (const c of codes)
					expect(PCI_SP_ONLY.has(c), `${k} ${c}`).toBe(false);
		}
		expect(PCI_SAQ_REQUIREMENTS.sp).toHaveLength(PCI_CODES.length);
		// kleine SAQ sind Teilmengen von SAQ D
		const d = new Set(PCI_SAQ_REQUIREMENTS.saq_d);
		for (const k of ["saq_a", "saq_b", "saq_p2pe", "saq_a_ep"])
			for (const c of PCI_SAQ_REQUIREMENTS[k] ?? [])
				expect(d.has(c)).toBe(true);
	});

	it("ohne Wahl gilt SAQ D für Händler: Dienstleister-Anforderungen entfallen", () => {
		expect(applicable("3.5.1")).toBe(true);
		expect(applicable("12.10.7")).toBe(true);
		expect(applicable("A1.1.1")).toBe(false);
		expect(applicable("11.4.6")).toBe(false);
		expect(applicable("11.4.6", "sp")).toBe(true);
	});

	it("SAQ A: kleiner Umfang, keine gespeicherten Kartendaten", () => {
		expect(applicable("9.4.1", "saq_a")).toBe(true);
		expect(applicable("12.8.5", "saq_a")).toBe(true);
		expect(applicable("3.5.1", "saq_a")).toBe(false);
		expect(applicable("10.2.1", "saq_a")).toBe(false);
		expect(applicable("9.5.1", "saq_a")).toBe(false);
		expect(applicable("9.5.1", "saq_p2pe")).toBe(true);
	});

	it("jede Anforderung kann mit Begründung ausgeschlossen werden", () => {
		expect(exclusionRule("pci-dss", "9.5.1").allowed).toBe(true);
		expect(exclusionRule("pci-dss", "12.1.1").allowed).toBe(true);
	});
});

describe("Einrichtung: Kartendaten", () => {
	const base = {
		sector: "other" as const,
		licenceStage: "0_vorbereitung" as const,
		caspServices: [],
		issuesTokens: "none" as const,
		hasProducts: false,
	};
	it("Kartendaten führen zu PCI DSS, ohne Kartendaten nicht", async () => {
		const { suggestFrameworks } = await import(
			"@/lib/compliance/company-profile"
		);
		const own = suggestFrameworks({ ...base, entity: { cardData: "own" } });
		expect(own.find((x) => x.slug === "pci-dss")?.recommended).toBe(true);
		const out = suggestFrameworks({
			...base,
			entity: { cardData: "outsourced" },
		});
		expect(out.find((x) => x.slug === "pci-dss")?.reason).toContain("SAQ A");
		const none = suggestFrameworks({ ...base, entity: { cardData: "none" } });
		expect(none.some((x) => x.slug === "pci-dss")).toBe(false);
		const bank = suggestFrameworks({
			...base,
			sector: "bank",
			licenceStage: "4_bank",
			entity: {},
		});
		expect(bank.find((x) => x.slug === "pci-dss")?.recommended).toBe(false);
	});
});
