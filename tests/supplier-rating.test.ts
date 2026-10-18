import { describe, expect, it } from "vitest";
import type { RatingScore } from "@/db/schema/supplier-ratings";
import {
	BASE_CRITERIA,
	defaultSupplierMethod,
} from "@/lib/compliance/catalog/supplier-criteria";
import {
	applicableCriteria,
	areaScore,
	decisionNeedsManagement,
	decisionNeedsNote,
	locationScore,
	nextRatingCode,
	nextReviewDate,
	outsourcingDecision,
	prefillScores,
	type RatingProvider,
	ratingLevel,
	suggestedMeasures,
	summarizeRating,
} from "@/lib/compliance/supplier-rating";

const s = (o: Record<string, number>): Record<string, RatingScore> =>
	Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { score: v }]));

const provider: RatingProvider = {
	partnerType: "ict",
	isOutsourcing: false,
	isIct: true,
	criticality: "important",
	processesPersonalData: true,
	country: "DE",
	dataLocations: ["DE", "IE"],
	substitutability: "difficult",
	dpaSignedAt: "2026-01-01",
	exitStrategy: null,
	exitPlanTestedAt: null,
	contractClauses: null,
};

describe("supplier-rating", () => {
	const m = defaultSupplierMethod();

	it("Vorlage: 14 Kriterien, Gewichte je Bereich summieren auf 1", () => {
		expect(BASE_CRITERIA).toHaveLength(14);
		for (const area of ["general", "security"] as const) {
			const sum = BASE_CRITERIA.filter((c) => c.area === area).reduce(
				(a, c) => a + c.weight,
				0,
			);
			expect(sum).toBeCloseTo(1, 6);
		}
		const codes = m.criteria.map((c) => c.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it("Rechenbeispiel wie im Excel: Allgemein 2,9 · Sicherheit 3,8 → 3,44 angemessen", () => {
		const scores = s({
			"SC-G-01": 2,
			"SC-G-02": 3,
			"SC-G-03": 2,
			"SC-G-04": 3,
			"SC-G-05": 4,
			"SC-G-06": 5,
			"SC-G-07": 3,
			"SC-S-01": 5,
			"SC-S-02": 4,
			"SC-S-03": 4,
			"SC-S-04": 3,
			"SC-S-05": 3,
			"SC-S-06": 5,
			"SC-S-07": 3,
		});
		const r = summarizeRating(
			BASE_CRITERIA,
			scores,
			m.areaWeights,
			m.thresholds,
		);
		expect(r.general).toBeCloseTo(2.9, 6);
		expect(r.security).toBeCloseTo(3.8, 6);
		expect(r.total).toBeCloseTo(3.44, 6);
		expect(r.percent).toBe(69);
		expect(r.level?.level).toBe("Angemessen");
		expect(r.level?.traffic).toBe("amber");
		expect(r.open).toEqual([]);
	});

	it("Unbewertete Kriterien zählen nicht; Gesamt erst mit beiden Bereichen", () => {
		const g = areaScore(
			BASE_CRITERIA,
			s({ "SC-G-01": 2, "SC-G-02": 4 }),
			"general",
		);
		expect(g).toBeCloseTo((0.25 * 2 + 0.15 * 4) / 0.4, 6);
		const r = summarizeRating(
			BASE_CRITERIA,
			s({ "SC-G-01": 2 }),
			m.areaWeights,
			m.thresholds,
		);
		expect(r.total).toBeNull();
		expect(r.level).toBeNull();
		expect(r.open).toHaveLength(13);
	});

	it("Schwellen und Wiedervorlage", () => {
		expect(ratingLevel(1.9, m.thresholds)?.level).toBe("Kritisch");
		expect(ratingLevel(2, m.thresholds)?.level).toBe("Eingeschränkt");
		expect(ratingLevel(3.5, m.thresholds)?.level).toBe("Hoch");
		expect(ratingLevel(4.25, m.thresholds)?.level).toBe("Sehr hoch");
		const from = new Date("2026-10-17T00:00:00Z");
		const top = ratingLevel(4.5, m.thresholds);
		expect(nextReviewDate(from, top, "standard", m)).toBe("2029-10-17");
		// kritische Dienstleister höchstens 12 Monate
		expect(nextReviewDate(from, top, "critical", m)).toBe("2027-10-17");
		expect(
			nextReviewDate(from, ratingLevel(1, m.thresholds), "standard", m),
		).toBe("2027-04-17");
	});

	it("Zusatzkriterien je Rahmenwerk und Partnerart", () => {
		const base = applicableCriteria(m, provider, ["iso27001"]).map(
			(c) => c.code,
		);
		expect(base).toHaveLength(14);
		const dora = applicableCriteria(m, provider, ["dora"]).map((c) => c.code);
		expect(dora).toEqual(
			expect.arrayContaining(["SC-D-01", "SC-D-02", "SC-D-03"]),
		);
		expect(dora).not.toContain("SC-O-01");
		const outs = applicableCriteria(m, { ...provider, isOutsourcing: true }, [
			"zag-marisk",
		]).map((c) => c.code);
		expect(outs).toContain("SC-O-01");
		const custodian = applicableCriteria(
			m,
			{ ...provider, partnerType: "custodian" },
			["micar"],
		).map((c) => c.code);
		expect(custodian).toEqual(expect.arrayContaining(["SC-K-01", "SC-K-03"]));
	});

	it("Vorbelegung aus Stammdaten", () => {
		const p = prefillScores(
			provider,
			applicableCriteria(m, provider, ["dora"]),
		);
		expect(p["SC-G-06"]?.score).toBe(5);
		expect(p["SC-S-06"]?.score).toBe(5);
		expect(p["SC-G-07"]?.score).toBe(2);
		expect(p["SC-S-07"]?.score).toBe(3);
		expect(locationScore("US")).toBe(3);
		expect(locationScore("NO")).toBe(4);
		expect(locationScore("CH")).toBe(2);
		const us = prefillScores(
			{ ...provider, dataLocations: ["US"] },
			BASE_CRITERIA,
		);
		expect(us["SC-G-06"]?.score).toBe(3);
		expect(us["SC-S-06"]?.score).toBe(1);
	});

	it("Auslagerung: Entscheidungsbaum", () => {
		expect(outsourcingDecision({}).label).toBe("offen");
		expect(outsourcingDecision({ instituteTask: false }).label).toBe(
			"fremdbezug",
		);
		expect(
			outsourcingDecision({ instituteTask: true, oneOff: true }).label,
		).toBe("fremdbezug");
		expect(
			outsourcingDecision({
				instituteTask: true,
				oneOff: false,
				material: true,
			}),
		).toEqual({
			isOutsourcing: true,
			isMaterial: true,
			label: "wesentliche_auslagerung",
		});
	});

	it("Maßnahmen je Ampel und Umständen", () => {
		const green = suggestedMeasures(
			"green",
			{ ...provider, isMaterial: false },
			[],
		);
		expect(green.map((x) => x.code)).toEqual(["SM-04", "SM-09", "SM-10"]);
		const red = suggestedMeasures(
			"red",
			{ ...provider, criticality: "critical", isMaterial: true },
			["dora"],
		).map((x) => x.code);
		expect(red).toEqual(
			expect.arrayContaining(["SM-03", "SM-13", "SM-D2", "SM-D3"]),
		);
	});

	it("Freigabe bei Rot nur über Geschäftsleitung; Begründungspflicht", () => {
		expect(decisionNeedsManagement("red", "approved")).toBe(true);
		expect(decisionNeedsManagement("red", "rejected")).toBe(false);
		expect(decisionNeedsManagement("amber", "approved")).toBe(false);
		expect(decisionNeedsNote("green", "approved")).toBe(false);
		expect(decisionNeedsNote("amber", "approved")).toBe(true);
		expect(decisionNeedsNote("green", "rejected")).toBe(true);
	});

	it("Codes LR-JJJJ-NN", () => {
		const now = new Date("2026-10-17T00:00:00Z");
		expect(nextRatingCode([], now)).toBe("LR-2026-01");
		expect(nextRatingCode(["LR-2026-01", "LR-2025-09"], now)).toBe(
			"LR-2026-02",
		);
	});
});

describe("supplier-method schema", () => {
	it("Vorlage ist gültig; Schwellen müssen aufsteigen und bei 0 beginnen", async () => {
		const { supplierMethodSchema } = await import(
			"@/lib/validation/supplier-method"
		);
		const m = defaultSupplierMethod();
		expect(supplierMethodSchema.safeParse(m).success).toBe(true);
		const bad = {
			...m,
			thresholds: [...m.thresholds].reverse(),
		};
		expect(supplierMethodSchema.safeParse(bad).success).toBe(false);
		const noSec = {
			...m,
			criteria: m.criteria.map((c) =>
				c.area === "security" ? { ...c, enabled: false } : c,
			),
		};
		expect(supplierMethodSchema.safeParse(noSec).success).toBe(false);
	});
});
