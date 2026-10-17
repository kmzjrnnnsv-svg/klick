import { describe, expect, it } from "vitest";
import { defaultRiskMethod } from "@/lib/compliance/risk-method";
import { buildRiskReportMarkdown } from "@/lib/export/risk-report";

describe("risk-report", () => {
	it("Deckblatt, Methodik, Risiko mit Excel-Spalten, Maßnahmenplan", () => {
		const out = buildRiskReportMarkdown({
			orgName: "Beispiel GmbH",
			author: "Erika",
			method: defaultRiskMethod(["iso27001", "dora"]),
			categoryLabel: (c) => (c === "ict_cyber" ? "IKT/Cyber" : c),
			risks: [
				{
					id: "1",
					code: "R-001",
					title: "Ransomware",
					category: "ict_cyber",
					status: "in_treatment",
					likelihood: 3,
					impact: 5,
					impactDetail: { outage: 5, data: 3 },
					impactDescription: "Betrieb steht | zwei Tage",
					existingMeasures: "Backups",
					protectionGoals: ["availability"],
					treatment: "mitigate",
					treatmentNote: null,
					residualLikelihood: 2,
					residualImpact: 3,
					residualNote: "tragbar",
					ownerName: "Erika",
					reviewAt: "2027-01-31",
					controls: ["CC-BCM-03"],
				},
			],
			measures: [
				{
					riskCode: "R-001",
					title: "Offline-Backup",
					ownerName: "Max",
					dueAt: "2026-12-01",
					costEur: 4500,
					status: "planned",
				},
			],
			history: [],
			asOf: new Date("2026-10-17T10:00:00Z"),
		});
		expect(out).toContain("# Risikoanalyse – Beispiel GmbH");
		expect(out).toContain("EW) + Schadenshöhe");
		expect(out).toContain("| hoch | 8–10 | nicht tolerierbar | 1 | 0 |");
		expect(out).toContain("3 + 5 = 8 · hoch (nicht tolerierbar)");
		expect(out).toContain("2 + 3 = 5 · mittel (tolerierbar)");
		expect(out).toContain("Betrieb steht \\| zwei Tage");
		expect(out).toContain("Ausfall von Prozess oder Service (an Werktagen): 5");
		expect(out).toContain(
			"| R-001 | Offline-Backup | Max | 2026-12-01 | 4.500 € | geplant |",
		);
		expect(out).toContain("Summe geplanter Kosten: 4.500 €");
	});
});
