import { describe, expect, it } from "vitest";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import { LEGACY_METHOD } from "@/lib/compliance/risk";
import { defaultRiskMethod } from "@/lib/compliance/risk-method";
import {
	behandlungsplan,
	buildBehandlungsplan,
} from "@/lib/evidence-studio/kinds/behandlungsplan";
import {
	buildKompetenz,
	kompetenz,
} from "@/lib/evidence-studio/kinds/kompetenz";
import { buildMessung, messung } from "@/lib/evidence-studio/kinds/messung";
import {
	buildRisikobeurteilung,
	risikobeurteilung,
} from "@/lib/evidence-studio/kinds/risikobeurteilung";
import {
	buildRisikomethodik,
	risikomethodik,
} from "@/lib/evidence-studio/kinds/risikomethodik";
import { buildSoa, soa } from "@/lib/evidence-studio/kinds/soa";
import { buildZiele, ziele } from "@/lib/evidence-studio/kinds/ziele";
import { type DocBlock, renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";

const ctx = { today: "2026-10-23" };
const md = (blocks: DocBlock[]) =>
	renderMarkdown({ title: "T", org: "O", meta: [], blocks });
const kv = (blocks: DocBlock[]) =>
	Object.fromEntries(
		blocks.flatMap((b) => (b.type === "keyValue" ? b.items : [])),
	);

describe("Batch B: Generatoren gehören zu Nachweisarten", () => {
	it("Codes existieren im Katalog", () => {
		for (const g of [
			risikomethodik,
			risikobeurteilung,
			behandlungsplan,
			soa,
			ziele,
			messung,
			kompetenz,
		])
			expect(EVIDENCE_KIND_BY_CODE.has(g.code), g.code).toBe(true);
	});
});

describe("Risikomethodik", () => {
	it("Rechenweg, Stufen, Schadensarten, Klassen mit Zone und Akzeptanz", () => {
		const method = defaultRiskMethod(["iso27001", "dora"]);
		const { blocks } = buildRisikomethodik({ stored: true, method });
		const m = md(blocks);
		expect(kv(blocks).Rechenweg).toBe(
			"Risikowert = Eintrittswahrscheinlichkeit + Schadenshöhe",
		);
		expect(kv(blocks).Wertebereich).toBe("2 bis 10");
		expect(kv(blocks).Grundlage).toBe("eigene Methodik der Organisation");
		expect(m).toContain("## Eintrittswahrscheinlichkeit");
		expect(m).toContain("## Risikoklassen");
		expect(m).toContain("nicht tolerierbar");
		// jede aktive Schadensart als eigener Abschnitt
		for (const d of method.dimensions.filter((x) => x.enabled))
			expect(m).toContain(`### ${d.label}`);
	});

	it("Altmethode: Produkt 1–25, als Vorlage gekennzeichnet", () => {
		const { blocks } = buildRisikomethodik({
			stored: false,
			method: LEGACY_METHOD,
		});
		expect(kv(blocks).Wertebereich).toBe("1 bis 25");
		expect(kv(blocks).Grundlage).toMatch(/Standardmethodik/);
	});
});

describe("Risikobeurteilung", () => {
	const base = {
		category: "ict_cyber",
		owner: "A",
		treatment: "mitigate",
		acceptedBy: null,
		acceptedAt: null,
	};
	it("Brutto/Netto nach Methodik, Zonen zählen nur nicht geschlossene", () => {
		const { blocks } = buildRisikobeurteilung(
			{
				method: LEGACY_METHOD,
				risks: [
					{
						...base,
						code: "R-001",
						title: "Ransomware",
						likelihood: 5,
						impact: 5,
						residualLikelihood: 2,
						residualImpact: 2,
						status: "in_treatment",
						reviewAt: "2026-10-01",
					},
					{
						...base,
						code: "R-002",
						title: "Ausfall RZ",
						likelihood: 4,
						impact: 5,
						residualLikelihood: null,
						residualImpact: null,
						status: "open",
						reviewAt: "2027-01-01",
					},
					{
						...base,
						code: "R-003",
						title: "alt",
						likelihood: 5,
						impact: 5,
						residualLikelihood: null,
						residualImpact: null,
						status: "closed",
						reviewAt: null,
					},
				],
			},
			ctx,
		);
		const k = kv(blocks);
		expect(k["Risiken (nicht geschlossen)"]).toBe("2");
		// R-001 netto 4 → akzeptabel, R-002 brutto 20 → nicht tolerierbar
		expect(k["davon akzeptabel"]).toBe("1");
		expect(k["davon nicht tolerierbar"]).toBe("1");
		expect(k["Überprüfung überfällig"]).toBe("1");
		const m = md(blocks);
		expect(m).toContain("5 × 5 → 25");
		expect(m).toContain("2 × 2 → 4");
		expect(m).toContain("nicht bewertet");
		expect(m).toContain("IKT / Cyber");
	});
});

describe("Behandlungsplan", () => {
	it("Stand aus der Aufgabe, überfällig zum Stichtag, Lücken und Akzeptanzen", () => {
		const { blocks } = buildBehandlungsplan(
			{
				measures: [
					{
						riskCode: "R-001",
						riskTitle: "Ransomware",
						title: "Offline-Backup",
						owner: "A",
						dueAt: "2026-10-01",
						costEur: 12000,
						status: "in_progress",
					},
					{
						riskCode: "R-001",
						riskTitle: "Ransomware",
						title: "EDR",
						owner: null,
						dueAt: "2026-09-01",
						costEur: null,
						status: "done",
					},
				],
				withoutMeasure: [{ code: "R-002", title: "Ausfall RZ", owner: "B" }],
				accepted: [
					{
						code: "R-004",
						title: "Restrisiko Phishing",
						reason: "Kosten unverhältnismäßig",
						acceptedBy: "GL",
						acceptedAt: "2026-06-01",
						reviewAt: "2027-06-01",
					},
				],
			},
			ctx,
		);
		const k = kv(blocks);
		expect(k.umgesetzt).toBe("1");
		expect(k.offen).toBe("1");
		expect(k.überfällig).toBe("1");
		const m = md(blocks);
		expect(m).toContain("in Umsetzung");
		expect(m).toMatch(/12\.000\s€/);
		expect(m).toContain("## Zu mindernde Risiken ohne Maßnahme");
		expect(m).toContain("Kosten unverhältnismäßig");
	});
});

describe("Erklärung zur Anwendbarkeit", () => {
	it("Ausschluss ohne Begründung fällt auf, Zählung je Stand", () => {
		const { blocks } = buildSoa({
			rows: [
				{
					code: "A.5.1",
					title: "Informationssicherheitsrichtlinien",
					applicable: true,
					justification: null,
					status: "covered",
					controls: [
						{
							code: "CC-GOV-01",
							title: "Leitlinie",
							status: "implemented",
							partial: false,
						},
					],
					evidence: 2,
				},
				{
					code: "A.7.1",
					title: "Physische Sicherheitsperimeter",
					applicable: false,
					justification: null,
					status: "not_applicable",
					controls: [],
					evidence: 0,
				},
			],
		});
		const k = kv(blocks);
		expect(k.anwendbar).toBe("1");
		expect(k.ausgeschlossen).toBe("1");
		expect(k.erfüllt).toBe("1");
		const m = md(blocks);
		expect(m).toContain("Begründung fehlt");
		expect(m).toContain("CC-GOV-01 Leitlinie (umgesetzt)");
	});
});

describe("Ziele und Messung", () => {
	const objective = {
		title: "Schulungsquote",
		kpiName: "Anteil geschulter Personen",
		unit: "%",
		direction: "higher_better" as const,
		targetValue: 95,
		warnAt: 90,
		alertAt: 80,
		nextMeasureAt: "2026-11-01",
	};

	it("Ziele mit Schwellen, Termin überschritten zum Stichtag", () => {
		const { blocks } = buildZiele(
			{
				objectives: [
					{
						...objective,
						frameworks: ["iso27001"],
						indicatorType: "kpi",
						target: null,
						measureEveryMonths: 3,
						owner: "ISB",
						dueAt: "2026-10-01",
						status: "at_risk",
						approvedBy: "GL",
						approvedAt: "2026-01-10",
					},
				],
			},
			ctx,
		);
		expect(kv(blocks)["Termin überschritten"]).toBe("1");
		const m = md(blocks);
		expect(m).toContain("KPI (Leistung)");
		expect(m).toContain("Ziel ≥ 95 %");
		expect(m).toContain("Alarm 80 %");
		expect(m).toContain("alle 3 Monate");
		expect(m).toContain("ISO 27001");
	});

	it("Messung: Bewertung je Wert, Trend, ohne Messung", () => {
		const { blocks } = buildMessung(
			{
				objectives: [
					{
						...objective,
						measurements: [
							{
								measuredAt: "2026-07-01",
								value: "92 %",
								numericValue: 92,
								note: null,
							},
							{
								measuredAt: "2026-10-01",
								value: "85 %",
								numericValue: 85,
								note: "Neue Mitarbeitende",
							},
						],
					},
					{ ...objective, title: "Patchquote", measurements: [] },
				],
			},
			ctx,
		);
		const k = kv(blocks);
		expect(k.Frühwarnung).toBe("1");
		expect(k["ohne aktuelle Messung"]).toBe("1");
		const m = md(blocks);
		expect(m).toContain("schlechter");
		expect(m).toContain("### Schulungsquote");
		expect(m).toContain("Neue Mitarbeitende");
		const pdf = renderPdf({ title: "T", org: "O", meta: [], blocks });
		expect(Buffer.from(pdf).toString("latin1").startsWith("%PDF-1.7")).toBe(
			true,
		);
	});
});

describe("Kompetenz", () => {
	it("Teilnahmequote, überfällig zum Stichtag, offene je Person", () => {
		const { blocks } = buildKompetenz(
			{
				requirements: [
					{
						code: "SCH-01",
						title: "Informationssicherheit",
						audience: null,
						frequencyMonths: 12,
						legalBasis: "ISO 27001 7.3",
						assignments: [
							{ person: "Anna", dueAt: "2026-12-01", done: true },
							{ person: "Ben", dueAt: "2026-09-01", done: false },
							{ person: "Cem", dueAt: "2026-12-01", done: false },
						],
					},
				],
				trainings: [
					{
						title: "Awareness 2026",
						heldAt: "2026-03-01",
						trainer: "Extern GmbH",
						audience: "all",
						attendees: 12,
					},
				],
			},
			ctx,
		);
		const k = kv(blocks);
		expect(k.abgeschlossen).toBe("1 (33 %)");
		expect(k.überfällig).toBe("1");
		const m = md(blocks);
		expect(m).toContain("1 von 3 (33 %)");
		expect(m).toContain("| Ben | 1 | 1 |");
		expect(m).toContain("Awareness 2026");
	});
});
