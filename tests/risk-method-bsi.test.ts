import { describe, expect, it } from "vitest";
import { RISK_SCENARIOS } from "@/lib/compliance/catalog/risk-scenarios";
import { assessRisk, riskMatrix } from "@/lib/compliance/risk";
import {
	aggregate,
	BSI_MATRIX,
	bsiRiskMethod,
	classify,
	defaultMatrix,
	defaultRiskMethod,
	fitLevels,
	levelCount,
	methodChangePreview,
	pointLabel,
	rescaleClasses,
	rescaleLevel,
	rescaleRiskValues,
	scoreRange,
	validateRiskMethod,
} from "@/lib/compliance/risk-method";
import { riskMethodSchema } from "@/lib/validation/risk-method";

// Risikomethode mit vier Stufen und Matrix (BSI-Standard 200-3), Umrechnung
// zwischen vier und fünf Stufen, 47 elementare Gefährdungen als Szenarien.

describe("Vorlage BSI-Standard 200-3", () => {
	const m = bsiRiskMethod(["iso27001", "dsgvo"]);

	it("ist gültig: vier Stufen, Matrix, vier Kategorien", () => {
		expect(validateRiskMethod(m)).toEqual([]);
		expect(riskMethodSchema.safeParse(m).success).toBe(true);
		expect(levelCount(m)).toBe(4);
		expect(m.impact).toHaveLength(4);
		for (const d of m.dimensions) expect(d.anchors, d.key).toHaveLength(4);
		expect(m.classes.map((c) => c.label)).toEqual([
			"gering",
			"mittel",
			"hoch",
			"sehr hoch",
		]);
		expect(scoreRange(m)).toEqual({ min: 1, max: 4 });
	});

	it("Kategorie kommt aus dem Feld der Matrix", () => {
		// selten × vernachlässigbar = gering, sehr häufig × existenzbedrohend = sehr hoch
		expect(classify(aggregate(1, 1, m), m).label).toBe("gering");
		expect(classify(aggregate(4, 4, m), m).label).toBe("sehr hoch");
		expect(classify(aggregate(1, 4, m), m).label).toBe("hoch");
		expect(classify(aggregate(3, 2, m), m).zone).toBe("tolerable");
		// Matrix steigt in jeder Zeile und Spalte nicht ab
		const rank = new Map(m.classes.map((c, i) => [c.key, i]));
		for (let l = 0; l < 4; l++)
			for (let i = 1; i < 4; i++) {
				const row = BSI_MATRIX[l] ?? [];
				expect(rank.get(row[i] ?? "")).toBeGreaterThanOrEqual(
					rank.get(row[i - 1] ?? "") ?? 0,
				);
				if (l > 0)
					expect(rank.get(row[i] ?? "")).toBeGreaterThanOrEqual(
						rank.get(BSI_MATRIX[l - 1]?.[i] ?? "") ?? 0,
					);
			}
	});

	it("Matrix-Ansicht hat 4 × 4 Felder, Anzeige ohne Zahl", () => {
		const grid = riskMatrix(
			[{ id: "r", likelihood: 4, impact: 4 }],
			"inherent",
			m,
		);
		expect(grid).toHaveLength(4);
		expect(grid[0]).toHaveLength(4);
		expect(grid[0]?.[3]?.riskIds).toEqual(["r"]);
		const a = assessRisk({ id: "r", likelihood: 4, impact: 4 }, m);
		expect(pointLabel(a.inherent, m)).toBe("sehr hoch");
		expect(a.aboveAppetite).toBe(true);
		// Werte über der Stufenzahl werden begrenzt
		expect(
			assessRisk({ id: "x", likelihood: 5, impact: 5 }, m).inherent,
		).toMatchObject({
			likelihood: 4,
			impact: 4,
		});
	});

	it("Matrix mit fehlendem Feld oder ungleichen Stufen ist ungültig", () => {
		expect(
			validateRiskMethod({ ...m, matrix: m.matrix?.slice(0, 3) }),
		).toContain("matrix_invalid");
		expect(
			validateRiskMethod({
				...m,
				matrix: m.matrix?.map((r) => r.map(() => "gibtsnicht")),
			}),
		).toContain("matrix_invalid");
		expect(validateRiskMethod({ ...m, impact: [...m.impact, "x"] })).toContain(
			"level_count",
		);
	});
});

describe("Stufenzahl wechseln", () => {
	it("rechnet Stufen proportional um", () => {
		expect([1, 2, 3, 4, 5].map((v) => rescaleLevel(v, 5, 4))).toEqual([
			1, 2, 3, 3, 4,
		]);
		expect([1, 2, 3, 4].map((v) => rescaleLevel(v, 4, 5))).toEqual([
			1, 2, 4, 5,
		]);
		const r = rescaleRiskValues(
			{
				likelihood: 5,
				impact: 1,
				residualLikelihood: null,
				residualImpact: null,
				impactDetail: { financial: 5, data: 3 },
			},
			5,
			4,
		);
		expect(r).toMatchObject({
			likelihood: 4,
			impact: 1,
			residualLikelihood: null,
			impactDetail: { financial: 4, data: 3 },
		});
	});

	it("Vorschau zählt Klassenwechsel über die Umrechnung", () => {
		const from = defaultRiskMethod([]);
		const to = bsiRiskMethod([]);
		const p = methodChangePreview(
			[
				{ likelihood: 5, impact: 5 },
				{ likelihood: 1, impact: 1 },
			],
			from,
			to,
		);
		expect(p.changed).toBeGreaterThanOrEqual(1);
	});

	it("auf Matrix umstellen: Klassen werden Ränge, Startmatrix vollständig", () => {
		const m = defaultRiskMethod([]);
		const classes = rescaleClasses(m.classes, m, {
			...m,
			aggregation: "matrix",
		});
		expect(classes.map((c) => [c.min, c.max])).toEqual([
			[1, 1],
			[2, 2],
			[3, 3],
		]);
		const matrix = defaultMatrix(5, classes);
		expect(
			validateRiskMethod({ ...m, aggregation: "matrix", classes, matrix }),
		).toEqual([]);
	});

	it("fitLevels begrenzt nur gesetzte Werte", () => {
		const m = bsiRiskMethod([]);
		expect(fitLevels({ likelihood: 5, residualImpact: null }, m)).toEqual({
			likelihood: 4,
		});
		expect(fitLevels({ impact: 5 }, defaultRiskMethod([]))).toEqual({
			impact: 5,
		});
	});
});

describe("Elementare Gefährdungen", () => {
	const bsi = RISK_SCENARIOS.filter((s) => s.group === "bsi");

	it("G 0.1 bis G 0.47 vollständig, eindeutig, an BSI 200-3", () => {
		expect(bsi.map((s) => s.bsiRef)).toEqual(
			Array.from({ length: 47 }, (_, i) => `G 0.${i + 1}`),
		);
		expect(new Set(bsi.map((s) => s.title)).size).toBe(47);
		for (const s of bsi) expect(s.frameworks).toContain("bsi-200-3");
		expect(bsi.find((s) => s.bsiRef === "G 0.18")?.title).toBe(
			"Fehlplanung oder fehlende Anpassung",
		);
	});
});
