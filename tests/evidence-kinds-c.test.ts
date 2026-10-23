import { describe, expect, it } from "vitest";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import {
	auditbericht,
	buildAuditbericht,
} from "@/lib/evidence-studio/kinds/auditbericht";
import {
	auditprogramm,
	buildAuditprogramm,
} from "@/lib/evidence-studio/kinds/auditprogramm";
import {
	buildDokumentenlenkung,
	dokumentenlenkung,
} from "@/lib/evidence-studio/kinds/dokumentenlenkung";
import { buildFindings, findings } from "@/lib/evidence-studio/kinds/findings";
import {
	buildKenntnisnahme,
	kenntnisnahme,
} from "@/lib/evidence-studio/kinds/kenntnisnahme";
import {
	buildManagementbewertung,
	managementbewertung,
} from "@/lib/evidence-studio/kinds/managementbewertung";
import {
	buildRichtlinien,
	richtlinien,
} from "@/lib/evidence-studio/kinds/richtlinien";
import {
	buildTestprogramm,
	testprogramm,
} from "@/lib/evidence-studio/kinds/testprogramm";
import {
	buildWirksamkeit,
	wirksamkeit,
} from "@/lib/evidence-studio/kinds/wirksamkeit";
import { type DocBlock, renderMarkdown } from "@/lib/export/doc-model";

const ctx = { today: "2026-10-23" };
const md = (blocks: DocBlock[]) =>
	renderMarkdown({ title: "T", org: "O", meta: [], blocks });
const kv = (blocks: DocBlock[]) =>
	blocks.flatMap((b) => (b.type === "keyValue" ? b.items : []));

describe("Generatoren Batch C gehören zu Nachweisarten", () => {
	it("Codes und Scope passen zum Katalog", () => {
		const gens = [
			dokumentenlenkung,
			richtlinien,
			kenntnisnahme,
			auditprogramm,
			auditbericht,
			findings,
			managementbewertung,
			testprogramm,
			wirksamkeit,
		];
		for (const g of gens) {
			const kind = EVIDENCE_KIND_BY_CODE.get(g.code);
			expect(kind, g.code).toBeDefined();
			// je Datensatz ⇔ Auswahl der Datensätze
			expect(Boolean(g.entities), g.code).toBe(kind?.scope === "per_entity");
		}
	});
});

describe("Dokumentenlenkung", () => {
	it("Nummernkreise, Stand und überfällige Prüfungen zum Stichtag", () => {
		const { blocks } = buildDokumentenlenkung(
			{
				prefixes: [
					{ type: "policy", prefix: "RL", next: 4 },
					{ type: "procedure", prefix: "VA", next: null },
				],
				documents: [
					{
						docNumber: "RL-001",
						title: "Leitlinie",
						type: "policy",
						status: "published",
						reviewCycleMonths: 12,
						nextReviewAt: "2026-09-01",
						approverFunction: "management_body",
					},
					{
						docNumber: "RL-002",
						title: "Zugang",
						type: "policy",
						status: "draft",
						reviewCycleMonths: 24,
						nextReviewAt: null,
						approverFunction: null,
					},
				],
			},
			ctx,
		);
		const out = md(blocks);
		expect(out).toContain("| Richtlinie | RL | RL-001 | RL-004 |");
		expect(out).toContain("| Verfahrensanweisung | VA | VA-001 | — |");
		expect(kv(blocks)).toContainEqual(["Prüfung überfällig", "1"]);
		expect(kv(blocks)).toContainEqual(["ohne Freigabestelle", "1"]);
		expect(out).toContain("| RL-001 | Leitlinie | 12 Monate | 01.09.2026 |");
		expect(out).toContain("Freigabestellen: Leitungsorgan / Geschäftsleitung.");
	});
});

describe("Richtlinienverzeichnis", () => {
	it("Verzeichnis mit Versionshistorie, Außer-Kraft getrennt", () => {
		const { blocks } = buildRichtlinien(
			{
				documents: [
					{
						docNumber: "RL-001",
						title: "Informationssicherheitsleitlinie",
						type: "policy",
						classification: "internal",
						status: "published",
						version: "2.0",
						effectiveFrom: "2026-01-01",
						owner: "A. Muster",
						reviewCycleMonths: 12,
						nextReviewAt: "2027-01-01",
						isoMandatory: true,
						versions: [
							{
								version: "2.0",
								changeSummary: "Jährliche Prüfung",
								approvedBy: "GF",
								approvedAt: "2025-12-20",
								publishedAt: "2026-01-01",
							},
						],
					},
					{
						docNumber: "RL-000",
						title: "Alte Leitlinie",
						type: "policy",
						classification: "internal",
						status: "superseded",
						version: "1.0",
						effectiveFrom: null,
						owner: null,
						reviewCycleMonths: 12,
						nextReviewAt: null,
						isoMandatory: false,
						versions: [],
					},
				],
			},
			ctx,
		);
		const out = md(blocks);
		expect(kv(blocks)).toContainEqual(["Dokumente im Verzeichnis", "1"]);
		expect(kv(blocks)).toContainEqual(["Pflichtdokumente (ISO 27001)", "1"]);
		expect(out).toContain("Informationssicherheitsleitlinie (Pflicht)");
		expect(out).toContain("| RL-001 | 2.0 | Jährliche Prüfung |");
		expect(out).toContain("RL-000 Alte Leitlinie (Version 1.0, ersetzt)");
	});
});

describe("Kenntnisnahme-Quote", () => {
	it("Quote gesamt und je Dokument, fehlende Namen", () => {
		const { blocks } = buildKenntnisnahme({
			documents: [
				{
					docNumber: "RL-001",
					title: "Leitlinie",
					version: "1.0",
					publishedAt: "2026-10-01",
					distribution: [],
					audience: [
						{ name: "Anna", acknowledgedAt: "2026-10-02" },
						{ name: "Ben", acknowledgedAt: null },
					],
				},
				{
					docNumber: "VA-001",
					title: "Passwörter",
					version: "1.0",
					publishedAt: "2026-10-01",
					distribution: ["editor"],
					audience: [{ name: "Anna", acknowledgedAt: "2026-10-03" }],
				},
			],
		});
		const out = md(blocks);
		expect(kv(blocks)).toContainEqual(["Quote gesamt", "67 %"]);
		expect(out).toContain(
			"| RL-001 | Leitlinie | 1.0 | 01.10.2026 | alle Mitglieder | 1 / 2 | 50 % |",
		);
		expect(out).toContain(
			"| VA-001 | Passwörter | 1.0 | 01.10.2026 | Bearbeiter:innen | 1 / 1 | 100 % |",
		);
		expect(out).toContain("| RL-001 | Leitlinie | Ben |");
	});

	it("ohne Dokumente: Quote „—“", () => {
		expect(kv(buildKenntnisnahme({ documents: [] }).blocks)).toContainEqual([
			"Quote gesamt",
			"—",
		]);
	});
});

describe("Auditprogramm", () => {
	it("Abdeckung und Lücken aus programmeCoverage", () => {
		const { blocks } = buildAuditprogramm({
			expected: {
				domains: ["governance", "access"],
				processes: [{ code: "P-01", name: "Zahlungen" }],
				providers: [],
			},
			programmes: [
				{
					title: "Auditprogramm 2026–2028",
					cycleStart: "2026-01-01",
					cycleYears: 3,
					approvedBy: "GF",
					approvedAt: "2026-01-10",
					items: [
						{
							scopeType: "domain",
							scopeRef: "governance",
							label: "Governance",
							plannedYear: 2026,
							riskRating: "high",
							frequencyYears: 1,
							audit: "Internes Audit 2026 (12.03.2026)",
						},
						{
							scopeType: "process",
							scopeRef: "P-01",
							label: "P-01 Zahlungen",
							plannedYear: 2027,
							riskRating: "medium",
							frequencyYears: 3,
							audit: null,
						},
					],
				},
			],
		});
		const out = md(blocks);
		expect(kv(blocks)).toContainEqual([
			"Abdeckung",
			"2 von 3 Prüfgegenständen (67 %)",
		]);
		expect(kv(blocks)).toContainEqual(["Jahre ohne Planung", "2028"]);
		expect(out).toContain("- Domäne: Identität & Zugang");
		expect(out).toContain("| 2026 | Domäne | Governance | hoch | alle 1 J. |");
	});

	it("ohne Programm: Hinweis statt leerer Tabelle", () => {
		expect(
			md(
				buildAuditprogramm({
					expected: { domains: [], processes: [], providers: [] },
					programmes: [],
				}).blocks,
			),
		).toContain("Noch kein Auditprogramm angelegt.");
	});
});

describe("Auditbericht", () => {
	it("Rahmen, Ergebnis nach Schwere, Feststellungen sortiert", () => {
		const r = buildAuditbericht({
			audit: {
				title: "Internes Audit ISMS 2026",
				type: "internal",
				scope: "ISMS gesamt",
				periodStart: "2026-01-01",
				periodEnd: "2026-09-30",
				frameworks: ["iso27001", "dora"],
				auditors: ["Prüferin P."],
				owner: "ISB",
				plannedAt: "2026-10-01",
				performedAt: "2026-10-05",
				status: "reported",
			},
			findings: [
				{
					title: "Hinweis Doku",
					description: null,
					severity: "observation",
					status: "open",
					control: null,
					requirement: null,
					nonconformity: null,
				},
				{
					title: "Backups ungetestet",
					description: "Kein Wiederherstellungstest 2026",
					severity: "major",
					status: "in_remediation",
					control: "CC-OPS-05",
					requirement: "ISO 27001 A.8.13",
					nonconformity: "NC-2026-004",
				},
			],
			requests: { total: 5, open: 1 },
		});
		expect(r.title).toBe("Auditbericht: Internes Audit ISMS 2026");
		const out = md(r.blocks);
		expect(kv(r.blocks)).toContainEqual([
			"Prüfungskriterien",
			"ISO 27001, DORA",
		]);
		expect(kv(r.blocks)).toContainEqual(["schwer", "1"]);
		expect(kv(r.blocks)).toContainEqual(["Nachweisanfragen", "5 (offen: 1)"]);
		expect(out).toContain("schwere Feststellungen");
		// schwer vor Beobachtung
		expect(out.indexOf("Backups ungetestet")).toBeLessThan(
			out.indexOf("Hinweis Doku"),
		);
		expect(out).toContain("NC-2026-004");
	});
});

describe("Findings-Register", () => {
	it("offen nach Schwere, Frist der Abweichung überschritten", () => {
		const { blocks } = buildFindings(
			{
				findings: [
					{
						audit: "Audit A",
						auditDate: "2026-03-01",
						title: "Rollen nicht besetzt",
						severity: "minor",
						status: "in_remediation",
						reference: "ISO 27001 5.3",
						createdAt: "2026-03-02",
						nonconformity: {
							code: "NC-2026-001",
							dueAt: "2026-06-01",
							status: "in_progress",
						},
					},
					{
						audit: "Audit A",
						auditDate: "2026-03-01",
						title: "Beobachtung",
						severity: "observation",
						status: "closed",
						reference: null,
						createdAt: "2026-03-02",
						nonconformity: null,
					},
				],
			},
			ctx,
		);
		expect(kv(blocks)).toContainEqual(["offen", "1"]);
		expect(kv(blocks)).toContainEqual(["davon offen leicht", "1"]);
		expect(kv(blocks)).toContainEqual([
			"Frist der Abweichung überschritten",
			"1",
		]);
		expect(md(blocks)).toContain("NC-2026-001 01.06.2026 · in Bearbeitung");
	});
});

describe("Managementbewertung", () => {
	it("Inputs, Zusammenfassung aus dem Schnappschuss, Ergebnisse", () => {
		const r = buildManagementbewertung({
			review: {
				heldAt: "2026-10-20",
				status: "held",
				owner: "GF",
				attendees: ["GF", "ISB"],
				summary: "ISMS angemessen.",
				decisions: null,
			},
			inputs: [
				{
					title: "Status der Maßnahmen",
					legalBasis: "ISO 27001 9.3.2 a)",
					done: true,
					note: null,
				},
				{
					title: "Änderungen",
					legalBasis: "ISO 27001 9.3.2 b)",
					done: false,
					note: "nächste Sitzung",
				},
			],
			digest: {
				from: "2025-10-20",
				to: "2026-10-20",
				sections: [
					{
						key: "nonconformities",
						title: "Abweichungen",
						facts: [{ label: "offen", value: "3", tone: "warn" }],
						items: [{ title: "NC-2026-001 Backups", note: "überfällig" }],
					},
				],
			},
		});
		expect(r.title).toBe("Managementbewertung vom 20.10.2026");
		const out = md(r.blocks);
		expect(kv(r.blocks)).toContainEqual([
			"Pflicht-Inputs behandelt",
			"1 von 2",
		]);
		expect(out).toContain("### Abweichungen");
		expect(out).toContain("- NC-2026-001 Backups – überfällig");
		expect(out).toContain("ISMS angemessen.");
		expect(out).toContain("_Keine Entscheidungen erfasst._");
	});
});

describe("Testprogramm", () => {
	it("je Testart eine Tabelle, Ergebnisse gezählt, überschrittene Termine", () => {
		const { blocks } = buildTestprogramm(
			{
				tests: [
					{
						method: "pentest",
						subject: "CC-OPS-08 Schwachstellen",
						scope: "Web-App",
						plannedAt: "2026-05-01",
						testedAt: "2026-05-10",
						result: "partial",
						tester: "Extern",
						nextTestAt: "2027-05-10",
					},
					{
						method: "bcm_exercise",
						subject: "Standort: Frankfurt",
						scope: null,
						plannedAt: "2026-09-01",
						testedAt: null,
						result: null,
						tester: null,
						nextTestAt: null,
					},
				],
			},
			ctx,
		);
		const out = md(blocks);
		expect(out).toContain("## Penetrationstest");
		expect(out).toContain("## BCM-Übung");
		expect(kv(blocks)).toContainEqual(["Ergebnis „teilweise wirksam“", "1"]);
		expect(kv(blocks)).toContainEqual(["Termin überschritten", "1"]);
		expect(out).toContain("| Standort: Frankfurt | 01.09.2026 | — | offen |");
	});
});

describe("Wirksamkeitsprüfungen", () => {
	it("Korrekturmaßnahmen und Control-Tests mit Ergebnis", () => {
		const { blocks } = buildWirksamkeit(
			{
				corrective: [
					{
						code: "NC-2026-001",
						title: "Backups",
						status: "closed",
						checkAt: "2026-08-01",
						result: "effective",
						owner: "ISB",
					},
					{
						code: "NC-2026-002",
						title: "Rollen",
						status: "verified",
						checkAt: "2026-09-01",
						result: null,
						owner: null,
					},
				],
				controlTests: [
					{
						control: "CC-IAM-01",
						method: "access_review",
						testedAt: "2026-07-01",
						result: "pass",
						tester: "ISB",
					},
				],
			},
			ctx,
		);
		const out = md(blocks);
		expect(kv(blocks)).toContainEqual(["„wirksam“", "1"]);
		expect(kv(blocks)).toContainEqual(["Prüfung überfällig", "1"]);
		expect(out).toContain(
			"| NC-2026-002 | Rollen | 01.09.2026 | offen | geprüft | — |",
		);
		expect(out).toContain(
			"| CC-IAM-01 | Rezertifizierung | 01.07.2026 | wirksam | ISB |",
		);
	});
});
