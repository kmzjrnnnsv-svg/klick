import { describe, expect, it } from "vitest";
import {
	classifyCompany,
	prefillFromSetup,
	sizeClass,
	suggestFrameworks,
} from "@/lib/compliance/company-profile";

describe("sizeClass (Empfehlung 2003/361)", () => {
	it("Grenzen für Beschäftigte und Umsatz oder Bilanzsumme", () => {
		expect(sizeClass({ employees: 8, revenueEur: 1_500_000 })).toBe("micro");
		expect(sizeClass({ employees: 8, revenueEur: 5_000_000 })).toBe("small");
		expect(sizeClass({ employees: 40, revenueEur: 9_000_000 })).toBe("small");
		expect(sizeClass({ employees: 120, revenueEur: 30_000_000 })).toBe(
			"medium",
		);
		// Umsatz zu hoch, aber Bilanzsumme unter der Grenze → bleibt mittel
		expect(
			sizeClass({
				employees: 200,
				revenueEur: 60_000_000,
				totalAssetsEur: 40_000_000,
			}),
		).toBe("medium");
		expect(sizeClass({ employees: 300 })).toBe("large");
		expect(sizeClass({})).toBeNull();
	});
});

describe("classifyCompany", () => {
	it("NIS2 nach Anhang und Größe", () => {
		expect(
			classifyCompany({ employees: 300, nis2Sector: "energy" }, "other").nis2,
		).toBe("essential");
		expect(
			classifyCompany({ employees: 80, nis2Sector: "energy" }, "other").nis2,
		).toBe("important");
		expect(
			classifyCompany({ employees: 300, nis2Sector: "food" }, "other").nis2,
		).toBe("important");
		expect(
			classifyCompany(
				{ employees: 20, revenueEur: 3_000_000, nis2Sector: "food" },
				"other",
			).nis2,
		).toBe("none");
		expect(
			classifyCompany(
				{ employees: 5, nis2Sector: "digital_infra_core" },
				"other",
			).nis2,
		).toBe("essential");
	});
	it("Finanzunternehmen: DORA vor NIS2, Preisgruppe nach Größe", () => {
		const c = classifyCompany(
			{ employees: 12, revenueEur: 4_000_000, nis2Sector: "banking" },
			"payment",
		);
		expect(c.nis2).toBe("dora");
		expect(c.size).toBe("small");
		expect(c.priceGroup).toBe("small");
		expect(c.reasons.join(" ")).toContain("Art. 4 NIS2");
	});
});

describe("suggestFrameworks", () => {
	it("Zahlungsinstitut mit Daten", () => {
		const s = suggestFrameworks({
			sector: "payment",
			licenceStage: "2_casp_zag",
			caspServices: [],
			issuesTokens: false,
			hasProducts: false,
			entity: { employees: 15, personalData: ["kunden"] },
		});
		const slugs = s.filter((x) => x.recommended).map((x) => x.slug);
		expect(slugs).toEqual(
			expect.arrayContaining([
				"dora",
				"zag",
				"zag-marisk",
				"gwg",
				"tfr",
				"dsgvo",
			]),
		);
		expect(slugs).not.toContain("micar");
		expect(slugs).not.toContain("nis2");
	});
	it("Hersteller ohne Finanzbezug: CRA, NIS2 bei Größe, ISO optional", () => {
		const s = suggestFrameworks({
			sector: "other",
			licenceStage: "0_vorbereitung",
			caspServices: [],
			issuesTokens: false,
			hasProducts: true,
			entity: { employees: 120, nis2Sector: "manufacturing" },
		});
		expect(s.map((x) => x.slug)).toEqual(
			expect.arrayContaining(["cra", "nis2", "dsgvo", "iso27001"]),
		);
		expect(s.find((x) => x.slug === "iso27001")?.recommended).toBe(true);
		const tiny = suggestFrameworks({
			sector: "other",
			licenceStage: "0_vorbereitung",
			caspServices: [],
			issuesTokens: false,
			hasProducts: false,
			entity: {},
		});
		expect(tiny.find((x) => x.slug === "iso27001")?.recommended).toBe(false);
	});
});

describe("prefillFromSetup", () => {
	it("nur teilweise und nur für gestellte Fragen", () => {
		const m = prefillFromSetup(
			{
				functionsAssigned: 3,
				functionsRequired: 6,
				sites: 2,
				ownDatacenter: false,
				itOperation: "cloud",
				providers: 4,
				profileComplete: true,
			},
			new Set(["CC-GOV-02", "CC-TPR-01", "CC-PHY-02"]),
		);
		expect([...m.keys()].sort()).toEqual([
			"CC-GOV-02",
			"CC-PHY-02",
			"CC-TPR-01",
		]);
		expect(m.get("CC-GOV-02")?.answer).toBe("partial");
		expect(m.get("CC-TPR-01")?.comment).toMatch(
			/^Aus der Einrichtung: 4 Dienstleister/,
		);
	});
});
