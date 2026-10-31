import { describe, expect, it } from "vitest";
import {
	deriveApplicability,
	type OrgProfile,
} from "@/lib/compliance/applicability";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	resolveFrameworkVariants,
	toProfile,
} from "@/lib/compliance/catalog-view";
import { suggestFrameworks } from "@/lib/compliance/company-profile";
import { exclusionRule } from "@/lib/compliance/exclusions";

// BSI IT-Grundschutz: vier Rahmenwerke, Absicherungsvariante steuert, welche
// Kapitel von 200-2 gelten; Vorschlag in der Einrichtung.

const bsi2 = FRAMEWORK_BY_SLUG.get("bsi-200-2");

function profile(variant?: string): OrgProfile {
	return toProfile({
		sector: "other",
		licenceStage: "0_vorbereitung",
		caspServices: [],
		frameworks: ["bsi-200-1", "bsi-200-2"],
		frameworkVariants: variant ? { "bsi-200-2": variant } : undefined,
		asOf: new Date("2026-10-31"),
	});
}

function applicable(code: string, p: OrgProfile): boolean {
	const r = bsi2?.requirements.find((x) => x.code === code);
	expect(r, code).toBeDefined();
	return deriveApplicability(
		{ framework: "bsi-200-2", code, variants: r?.variants },
		p,
	).applicable;
}

describe("BSI-Standards", () => {
	it("vier Rahmenwerke mit Kapiteln, 200-2 mit drei Absicherungsvarianten", () => {
		for (const slug of ["bsi-200-1", "bsi-200-2", "bsi-200-3", "bsi-200-4"])
			expect(
				FRAMEWORK_BY_SLUG.get(slug)?.requirements.length,
				slug,
			).toBeGreaterThan(5);
		expect(bsi2?.variants?.map((v) => v.key)).toEqual([
			"standard",
			"basis",
			"kern",
		]);
		const tagged = (key: string) =>
			bsi2?.requirements.filter((r) => r.variants?.includes(key)).length ?? 0;
		expect(tagged("basis")).toBeGreaterThan(0);
		expect(tagged("standard")).toBeGreaterThan(0);
		expect(tagged("kern")).toBeGreaterThan(0);
	});

	it("ohne Wahl gilt die Standard-Absicherung", () => {
		expect(resolveFrameworkVariants(undefined)["bsi-200-2"]).toBe("standard");
		expect(
			resolveFrameworkVariants({ "bsi-200-2": "gibtsnicht" })["bsi-200-2"],
		).toBe("standard");
		const p = profile();
		expect(applicable("8.2", p)).toBe(true);
		expect(applicable("6.3", p)).toBe(false);
		expect(applicable("7.1", p)).toBe(false);
		// Kapitel ohne Variante gelten immer
		expect(applicable("3.2", p)).toBe(true);
		expect(applicable("9", p)).toBe(true);
	});

	it("Basis-Absicherung: Kapitel 6 gilt, Schutzbedarf und Risikoanalyse nicht", () => {
		const p = profile("basis");
		expect(applicable("6.3", p)).toBe(true);
		expect(applicable("8.2", p)).toBe(false);
		expect(applicable("8.5", p)).toBe(false);
		const r = bsi2?.requirements.find((x) => x.code === "8.2");
		expect(
			deriveApplicability(
				{ framework: "bsi-200-2", code: "8.2", variants: r?.variants },
				p,
			),
		).toEqual({
			applicable: false,
			source: "variant",
			note: "Gilt nicht für die gewählte Variante (Basis-Absicherung)",
		});
	});

	it("Kern-Absicherung: Kronjuwelen und Risikoanalyse gelten", () => {
		const p = profile("kern");
		expect(applicable("7.1", p)).toBe(true);
		expect(applicable("7.5", p)).toBe(true);
		expect(applicable("6.3", p)).toBe(false);
		expect(applicable("8.1", p)).toBe(false);
	});

	it("die Methodik kennt keinen Ausschluss", () => {
		expect(exclusionRule("bsi-200-2", "8.2").allowed).toBe(false);
		expect(exclusionRule("bsi-200-4", "9").allowed).toBe(false);
	});

	it("Einrichtung: öffentliche Verwaltung bekommt 200-1/200-2 empfohlen, sonst nur angeboten", () => {
		const base = {
			licenceStage: "0_vorbereitung" as const,
			caspServices: [],
			issuesTokens: "none" as const,
			hasProducts: false,
		};
		const admin = suggestFrameworks({
			...base,
			sector: "other",
			entity: { employees: 300, nis2Sector: "public_admin" },
		});
		const rec = admin.filter((x) => x.recommended).map((x) => x.slug);
		expect(rec).toEqual(
			expect.arrayContaining(["bsi-200-1", "bsi-200-2", "bsi-200-3"]),
		);
		const firm = suggestFrameworks({
			...base,
			sector: "other",
			entity: { employees: 20 },
		});
		expect(firm.find((x) => x.slug === "bsi-200-1")?.recommended).toBe(false);
		expect(firm.some((x) => x.slug === "bsi-200-3")).toBe(false);
	});
});
