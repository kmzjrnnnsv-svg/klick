import { describe, expect, it } from "vitest";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import {
	CORRIDOR_DOSSIER_QUESTIONS,
	CORRIDOR_STEPS,
} from "@/lib/compliance/catalog/corridor-template";
import { CRYPTO_ASSETS } from "@/lib/compliance/catalog/crypto-assets";
import { JURISDICTIONS } from "@/lib/compliance/catalog/jurisdictions";
import {
	buildRoadmap,
	ROADMAP_PHASES,
	ROADMAP_TEMPLATE,
} from "@/lib/compliance/catalog/roadmap";
import { TOOL_LANDSCAPE } from "@/lib/compliance/catalog/tool-landscape";

describe("P4 seeds", () => {
	it("Jurisdiktionen: ISO2 eindeutig, Sanktionsländer blockiert, VAE nicht mehr Hochrisiko", () => {
		const codes = JURISDICTIONS.map((j) => j.iso2);
		expect(new Set(codes).size).toBe(codes.length);
		for (const j of JURISDICTIONS) {
			expect(j.iso2).toMatch(/^[A-Z]{2}$/);
			if (j.euSanctions && j.fatfStatus === "black")
				expect(j.orgStance).toBe("blocked");
		}
		const ae = JURISDICTIONS.find((j) => j.iso2 === "AE");
		expect(ae?.euHighRisk).toBe(false);
		expect(ae?.fatfStatus).toBe("none");
		expect(JURISDICTIONS.find((j) => j.iso2 === "KE")?.fatfStatus).toBe("grey");
		expect(JURISDICTIONS.find((j) => j.iso2 === "KW")?.fatfStatus).toBe("grey");
		expect(JURISDICTIONS.find((j) => j.iso2 === "IR")?.orgStance).toBe(
			"blocked",
		);
		expect(JURISDICTIONS.find((j) => j.iso2 === "RU")?.euSanctions).toBe(true);
	});

	it("Kryptowerte: nur zugelassene EMT oder native Werte akzeptiert; USDT nicht", () => {
		for (const a of CRYPTO_ASSETS) {
			if (a.accepted)
				expect(a.type === "native" || a.micarStatus === "authorised").toBe(
					true,
				);
		}
		expect(CRYPTO_ASSETS.find((a) => a.symbol === "USDT")?.accepted).toBe(
			false,
		);
		expect(CRYPTO_ASSETS.find((a) => a.symbol === "EURC")?.micarStatus).toBe(
			"authorised",
		);
		const symbols = CRYPTO_ASSETS.map((a) => a.symbol);
		expect(new Set(symbols).size).toBe(symbols.length);
	});

	it("Tool-Landkarte: ≥ 20 Kategorien, Controls auflösbar, Marktbeispiele vorhanden", () => {
		expect(TOOL_LANDSCAPE.length).toBeGreaterThanOrEqual(20);
		const codes = TOOL_LANDSCAPE.map((t) => t.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const t of TOOL_LANDSCAPE) {
			expect(t.startup.length).toBeGreaterThan(0);
			expect(t.scale.length).toBeGreaterThan(0);
			for (const c of t.controls)
				expect(CONTROL_BY_CODE.has(c), `${t.code} → ${c}`).toBe(true);
		}
	});

	it("Roadmap: Vorlage bis Zielstufe, Fälligkeiten am Monatsende, Controls auflösbar", () => {
		for (const m of ROADMAP_TEMPLATE) {
			expect(ROADMAP_PHASES.some((p) => p.key === m.phase)).toBe(true);
			for (const c of m.controls)
				expect(CONTROL_BY_CODE.has(c), `${m.code} → ${c}`).toBe(true);
		}
		const start = new Date("2026-10-15T00:00:00Z");
		const stage0 = buildRoadmap(start, "0_vorbereitung");
		const stage2 = buildRoadmap(start, "2_casp_zag");
		expect(stage0.every((m) => m.phase === "0_vorbereitung")).toBe(true);
		expect(stage2.length).toBeGreaterThan(stage0.length);
		expect(stage2.some((m) => m.code === "RM-31")).toBe(true);
		expect(stage2.some((m) => m.phase === "3_emi")).toBe(false);
		expect(stage0[0]?.dueAt).toBe("2026-10-31");
		const rm23 = stage2.find((m) => m.code === "RM-23");
		expect(rm23?.dueAt).toBe("2027-08-31");
	});

	it("Korridor-Vorlage: 8 Schritte in Reihenfolge, 15 Fragen", () => {
		expect(CORRIDOR_STEPS.map((s) => s.order)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8,
		]);
		expect(CORRIDOR_DOSSIER_QUESTIONS.length).toBe(15);
		for (let i = 1; i < CORRIDOR_STEPS.length; i++)
			expect(CORRIDOR_STEPS[i]?.offsetDays).toBeGreaterThanOrEqual(
				CORRIDOR_STEPS[i - 1]?.offsetDays ?? 0,
			);
	});
});
