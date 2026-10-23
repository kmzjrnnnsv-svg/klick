import { describe, expect, it } from "vitest";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import {
	assembleDoc,
	canonicalJson,
	contentHash,
	requirementLabel,
} from "@/lib/evidence-studio/generate/doc";
import { GENERATORS } from "@/lib/evidence-studio/generate/registry";
import {
	type AbweichungenFacts,
	buildAbweichungen,
} from "@/lib/evidence-studio/kinds/abweichungen";
import { buildKontext } from "@/lib/evidence-studio/kinds/kontext";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";

describe("Schnappschuss und Prüfsumme", () => {
	it("kanonisch: Reihenfolge der Schlüssel egal, undefined fällt weg", () => {
		expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: "x" }] })).toBe(
			'{"a":[2,{"c":"x"}],"b":1}',
		);
		const a = contentHash({
			v: 1,
			kind: "NW-X",
			entityId: null,
			facts: { a: 1, b: 2 },
		});
		const b = contentHash({
			v: 1,
			kind: "NW-X",
			entityId: null,
			facts: { b: 2, a: 1 },
		});
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
		expect(
			contentHash({
				v: 1,
				kind: "NW-X",
				entityId: null,
				facts: { a: 2, b: 2 },
			}),
		).not.toBe(a);
	});

	it("jeder Generator gehört zu einer Nachweisart", () => {
		for (const code of GENERATORS.keys())
			expect(EVIDENCE_KIND_BY_CODE.has(code), code).toBe(true);
	});
});

describe("Dokument zusammensetzen", () => {
	const kind = EVIDENCE_KIND_BY_CODE.get("NW-KONTEXT");
	if (!kind) throw new Error("kind");

	it("Kopf mit Stand, Version, Nachweis-ID, Prüfsumme; „Belegt“ und Unterschriften", () => {
		const doc = assembleDoc({
			kind,
			org: "Muster GmbH",
			today: "2026-10-23",
			version: 2,
			evidenceId: "e1",
			contentSha256: "a".repeat(64),
			blocks: [{ type: "paragraph", text: "x" }],
			signers: [
				{ function: "management_body", mode: "all", holders: ["A", "B"] },
				{ function: "isb", mode: "any", holders: [] },
			],
		});
		expect(doc.meta).toEqual([
			["Stand", "23.10.2026"],
			["Version", "2"],
			["Nachweis", "NW-KONTEXT · e1"],
			["Prüfsumme (Inhalt)", "a".repeat(64)],
		]);
		const md = renderMarkdown(doc);
		expect(md).toContain("## Belegt");
		expect(md).toContain(requirementLabel(kind.requirements[0] ?? ""));
		// „alle“: je Person ein Feld; unbesetzte Funktion wird sichtbar
		expect(md).toContain("| Leitungsorgan / Geschäftsleitung | A | offen |");
		expect(md).toContain("| Leitungsorgan / Geschäftsleitung | B | offen |");
		expect(md).toContain("(Funktion nicht besetzt)");
	});

	it("Anforderungen mit Rahmenwerk-Kurzname und Titel", () => {
		expect(requirementLabel("iso27001:4.1")).toMatch(/^ISO 27001 4\.1 – /);
		expect(requirementLabel("gibtsnicht:1")).toBe("gibtsnicht 1");
	});
});

describe("Builder", () => {
	it("Kontext trennt externe und interne Themen", () => {
		const { blocks } = buildKontext({
			issues: [
				{
					scope: "external",
					title: "Regulierung",
					description: "DORA",
					impact: "hoch",
					owner: "A",
					reviewAt: "2027-01-01",
				},
				{
					scope: "internal",
					title: "Personal",
					description: null,
					impact: null,
					owner: null,
					reviewAt: null,
				},
			],
		});
		const tables = blocks.filter((b) => b.type === "table");
		expect(tables).toHaveLength(2);
		expect(tables[0]?.type === "table" && tables[0].rows[0]?.[0]).toBe(
			"Regulierung",
		);
		expect(tables[1]?.type === "table" && tables[1].rows[0]?.[0]).toBe(
			"Personal",
		);
	});

	it("Abweichungen: Kennzahlen zum Stichtag, Fristen je Rahmenwerk", () => {
		const f: AbweichungenFacts = {
			items: [
				{
					code: "NC-2026-001",
					title: "Backups ungetestet",
					source: "audit",
					status: "open",
					priority: null,
					followUpClass: "major",
					rootCause: null,
					correction: null,
					correctiveAction: null,
					dueAt: "2026-10-01",
					planDueAt: "2026-09-15",
					followUp: [
						{
							framework: "iso27001",
							classLabel: "Hauptabweichung",
							planDue: "2026-09-15",
							closeDue: "2026-10-01",
						},
						{
							framework: "dora",
							classLabel: "Kritische Feststellung",
							planDue: "2026-09-20",
							closeDue: "2026-10-01",
						},
					],
					effectivenessResult: null,
					owner: "A",
				},
			],
		};
		const { blocks } = buildAbweichungen(f, { today: "2026-10-23" });
		const kv = blocks.find((b) => b.type === "keyValue");
		expect(kv?.type === "keyValue" && kv.items).toContainEqual([
			"überfällig",
			"1",
		]);
		const md = renderMarkdown({ title: "T", org: "O", meta: [], blocks });
		expect(md).toContain("| NC-2026-001 | DORA | Kritische Feststellung |");
		expect(md).toContain("Hauptabweichung");
		// ein späterer Stichtag ändert nur die Kennzahl, nicht den Schnappschuss
		const pdf = renderPdf({ title: "T", org: "O", meta: [], blocks });
		expect(Buffer.from(pdf).toString("latin1").startsWith("%PDF-1.7")).toBe(
			true,
		);
	});
});
