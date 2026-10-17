import { describe, expect, it } from "vitest";
import { deriveReadiness } from "@/lib/compliance/readiness";
import { buildReadinessMarkdown } from "@/lib/export/readiness-report";

describe("buildReadinessMarkdown", () => {
	it("enthält Ergebnis, Maßnahmen in Reihenfolge und Methode", () => {
		const result = deriveReadiness({
			framework: "iso27001",
			asOf: new Date("2026-10-17T12:00:00Z"),
			requirements: [
				{ key: "iso27001:A.5.1", sectionCode: "A.5", status: "covered" },
				{ key: "iso27001:A.8.13", sectionCode: "A.8", status: "open" },
			],
			edges: [
				{
					control: "CC-GOV-01",
					requirement: "iso27001:A.5.1",
					coverage: "full",
				},
				{
					control: "CC-BCM-03",
					requirement: "iso27001:A.8.13",
					coverage: "full",
				},
			],
			controls: new Map([
				[
					"CC-GOV-01",
					{
						title: "Leitlinie",
						effort: "S" as const,
						implStatus: "implemented" as const,
						testRequired: false,
						evidence: [],
						tests: [],
					},
				],
				[
					"CC-BCM-03",
					{
						title: "Backups | Restore",
						effort: "M" as const,
						implStatus: "not_started" as const,
						testRequired: true,
						evidence: [],
						tests: [],
					},
				],
			]),
			mandatoryDocs: [
				{ templateCode: "RL-ISMS-LEITLINIE", title: "Leitlinie", doc: null },
			],
			nonconformities: [],
			findings: [],
		});
		const md = buildReadinessMarkdown({
			orgName: "Muster GmbH",
			frameworkName: "ISO/IEC 27001:2022",
			result,
			sectionTitles: { "A.5": "Organisatorisch", "A.8": "Technologisch" },
			generatedAt: new Date("2026-10-17T12:00:00Z"),
		});
		expect(md).toContain("# Prüfungsreife: ISO/IEC 27001:2022");
		expect(md).toContain("| Stichtag | 2026-10-17 |");
		expect(md).toContain("Pflichtdokument erstellen");
		// Pipes in Labels werden entschärft
		expect(md).toContain("Backups \\| Restore");
		// kritischer Dokument-Punkt steht vor dem Control
		expect(md.indexOf("Pflichtdokument erstellen")).toBeLessThan(
			md.indexOf("Control umsetzen"),
		);
		expect(md).toContain("kein Testat");
	});
});
