import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	laneLabelFor,
	PLAN_CSV_HEADER,
	type PlanExportInput,
	planCsvRows,
	planDocBlocks,
	planMarkdownLines,
} from "@/lib/assessments/plan-export";
import {
	frameworkReadiness,
	type ScheduleMeasure,
	schedulePlan,
} from "@/lib/assessments/schedule";
import type { CatalogOrderControl } from "@/lib/compliance/catalog/control-order";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";

// Teil C2: Umsetzungsplan als CSV, im Gap-Bericht und als PDF mit Balken.

const ctl = (code: string): [string, CatalogOrderControl] => [
	code,
	{
		code: code as CatalogOrderControl["code"],
		domain: "operations",
		kind: "process",
	},
];
const m = (
	controlCode: string,
	effort: "S" | "M" | "L" = "S",
	kind: ScheduleMeasure["kind"] = "implement",
): ScheduleMeasure => ({ controlCode, effort, kind });

function input(codes: string[], capacity = 2): PlanExportInput {
	const controls = new Map(codes.map(ctl));
	const schedule = schedulePlan({
		measures: codes.map((c, i) =>
			m(
				c,
				(["S", "M", "L"] as const)[i % 3],
				i % 4 === 3 ? "clarify" : "implement",
			),
		),
		controls,
		partial: new Set(),
		laneOf: (c) => (codes.indexOf(c) % 2 === 0 ? "f:isb_ciso" : "u:u1"),
		settings: {
			start: "2026-11-09",
			capacity,
			overrides: { [codes[0] ?? ""]: 7 },
		},
	});
	const readiness = frameworkReadiness({
		frameworks: ["fw"],
		schedule,
		catalog: {
			requirements: [{ framework: "fw", code: "1", domain: "operations" }],
			edges: [
				{ control: codes[0] ?? "", requirement: "fw:1", coverage: "full" },
			],
		},
		implStatus: new Map(),
	});
	return {
		schedule,
		readiness,
		title: (c) => `Titel ${c} | mit Strich`,
		laneLabel: (lane) =>
			laneLabelFor(lane, {
				fn: (k) => (k === "isb_ciso" ? "ISB" : k),
				member: (id) => (id === "u1" ? "Ada" : undefined),
				area: (a) => `Ohne Zuständigkeit: ${a}`,
				person: "Eine Person",
			}),
		frameworkName: () => "ISO 27001",
	};
}

describe("Spur-Namen", () => {
	const deps = {
		fn: (k: string) => `F(${k})`,
		member: (id: string) => (id === "u1" ? "Ada" : undefined),
		area: (a: string) => `A(${a})`,
		person: "Eine Person",
	};
	it("nennt Funktion, Person oder Bereich", () => {
		expect(laneLabelFor("f:dpo", deps)).toBe("F(dpo)");
		expect(laneLabelFor("f:role:abc", deps)).toBe("F(role:abc)");
		expect(laneLabelFor("u:u1", deps)).toBe("Ada");
		expect(laneLabelFor("u:weg", deps)).toBe("Eine Person");
		expect(laneLabelFor("a:access", deps)).toBe("A(access)");
	});
});

describe("CSV", () => {
	it("eine Zeile je Maßnahme in Reihenfolge des Beginns", () => {
		const rows = planCsvRows(input(["A", "B", "C", "D"]));
		expect(rows).toHaveLength(4);
		expect(rows.every((r) => r.length === PLAN_CSV_HEADER.length)).toBe(true);
		const starts = rows.map((r) => r[3] ?? "");
		expect([...starts].sort()).toEqual(starts);
		const a = rows.find((r) => r[0] === "A");
		expect(a).toEqual([
			"A",
			"Titel A | mit Strich",
			"umsetzen",
			"2026-11-09",
			"2026-11-17",
			"7",
			"eigene",
			"ISB",
			"",
		]);
		expect(rows.find((r) => r[0] === "B")?.[7]).toBe("Ada");
		expect(rows.find((r) => r[0] === "D")?.[2]).toBe("klären");
	});
});

describe("Gap-Bericht", () => {
	it("Abschnitt mit Bereitschaft und Tabelle", () => {
		const md = planMarkdownLines(input(["A", "B"])).join("\n");
		expect(md).toContain("## Umsetzungsplan");
		expect(md).toContain("Beginn 09.11.2026");
		expect(md).toContain("ISO 27001: bereit ab 17.11.2026");
		// Strich im Titel bricht die Tabelle nicht
		expect(md).toContain("Titel A \\| mit Strich");
		expect(md).toContain(
			"| A | Titel A \\| mit Strich | umsetzen | 09.11.2026 | 17.11.2026 | 7 (eigene) | ISB |",
		);
	});

	it("ohne Maßnahmen ein Satz", () => {
		const empty = input([]);
		expect(planMarkdownLines(empty).join("\n")).toContain(
			"Keine offenen Maßnahmen.",
		);
		expect(planDocBlocks(empty)).toEqual([
			{ type: "paragraph", text: "Keine offenen Maßnahmen." },
		]);
	});
});

// Inhalt je Datenstrom eines PDF (Flate) als Text, für Stichproben
function pdfPages(pdf: Uint8Array): string[] {
	const buf = Buffer.from(pdf);
	const out: string[] = [];
	let at = 0;
	for (;;) {
		const s = buf.indexOf("stream\n", at);
		if (s < 0) break;
		const e = buf.indexOf("\nendstream", s);
		try {
			out.push(inflateSync(buf.subarray(s + 7, e)).toString("latin1"));
		} catch {
			// Anhänge u. Ä.
		}
		at = e + 10;
	}
	return out;
}
const pdfText = (pdf: Uint8Array) => pdfPages(pdf).join("\n");

describe("PDF", () => {
	const doc = (codes: string[]) => ({
		title: "Umsetzungsplan",
		org: "Muster GmbH",
		meta: [["Stand", "2026-11-04"]] as [string, string][],
		blocks: planDocBlocks(input(codes)),
	});

	it("zeichnet Balken mit Monatsachse und Legende", () => {
		const pdf = renderPdf(doc(["A", "B", "C"]), {
			now: new Date("2026-11-04T10:00:00Z"),
		});
		expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
		const text = pdfText(pdf);
		expect(text).toContain("(Nov 26)");
		expect(text).toContain("(Umsetzen)");
		expect(text).toContain("(ISB)");
		// Balken = gefüllte Rechtecke
		expect((text.match(/ re f/g) ?? []).length).toBeGreaterThan(3);
	});

	it("bricht lange Pläne über Seiten und wiederholt die Achse", () => {
		const codes = Array.from({ length: 140 }, (_, i) => `C${i}`);
		const pdf = renderPdf(doc(codes));
		const pages = pdfPages(pdf);
		expect(pages.length).toBeGreaterThan(2);
		// Monate der Achse auf jeder Seite mit Balken
		const month =
			/\((Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez) \d\d\) Tj/;
		// Balken „umsetzen“ sind im Grauton 0.22 gefüllt
		const withBars = pages.filter((p) => p.includes("0.22 g"));
		expect(withBars.length).toBeGreaterThan(1);
		for (const p of withBars) expect(p).toMatch(month);
	});

	it("Markdown zeigt den Balkenplan als Tabelle", () => {
		const md = renderMarkdown(doc(["A", "B"]));
		expect(md).toContain("| Gruppe | Zeile | Art | Beginn | Ende |");
		expect(md).toContain(
			"| ISB | A Titel A \\| mit Strich | Umsetzen | 2026-11-09 | 2026-11-17 |",
		);
	});
});
