import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { type DocModel, renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf, wrapText } from "@/lib/export/pdf";
import { textWidth, toWinAnsi, WIDTHS } from "@/lib/export/pdf-fonts";

const NOW = new Date("2026-10-23T12:00:00Z");

const doc = (rows = 3): DocModel => ({
	title: "Kontextanalyse",
	subtitle: "Interne und externe Themen",
	org: "Muster GmbH",
	meta: [
		["Stand", "23.10.2026"],
		["Prüfsumme (Inhalt)", "ab".repeat(32)],
	],
	blocks: [
		{ type: "heading", level: 1, text: "Prüfung „extern“ – 5 €" },
		{ type: "paragraph", text: "Absatz mit (Klammern) und \\ Backslash." },
		{ type: "list", items: ["eins", "zwei"] },
		{ type: "keyValue", items: [["Verantwortlich", "ISB"]] },
		{
			type: "table",
			columns: [{ label: "Nr." }, { label: "Thema" }],
			rows: Array.from({ length: rows }, (_, i) => [
				`K-${i + 1}`,
				`Thema ${i + 1} mit Text`,
			]),
		},
		{
			type: "signatures",
			signers: [{ role: "Geschäftsführung", name: "E. Muster" }],
		},
	],
	footer: "Erzeugt mit Klick",
});

const latin1 = (b: Uint8Array) => Buffer.from(b).toString("latin1");

// Inhalte aller Flate-Streams (Seiteninhalte, Anhänge)
function streams(pdf: Uint8Array): string[] {
	const s = latin1(pdf);
	const out: string[] = [];
	const re = /\/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g;
	for (let m = re.exec(s); m; m = re.exec(s)) {
		const start = m.index + m[0].length;
		const data = Buffer.from(pdf).subarray(start, start + Number(m[1]));
		out.push(inflateSync(data).toString("latin1"));
	}
	return out;
}

describe("PDF-Schriften (WinAnsi, AFM-Breiten)", () => {
	it("Tabellen haben 224 Breiten (32–255)", () => {
		for (const w of Object.values(WIDTHS)) expect(w).toHaveLength(224);
	});

	it("Umlaute, deutsche Anführungszeichen, Strich und Euro", () => {
		expect(toWinAnsi("äöüß ÄÖÜ")).toEqual([
			0xe4, 0xf6, 0xfc, 0xdf, 0x20, 0xc4, 0xd6, 0xdc,
		]);
		expect(toWinAnsi("„a“ ‚b‘ – — … €")).toEqual([
			0x84, 97, 0x93, 32, 0x82, 98, 0x91, 32, 0x96, 32, 0x97, 32, 0x85, 32,
			0x80,
		]);
		// ohne WinAnsi-Code: lesbarer Ersatz statt Fragezeichen
		expect(String.fromCharCode(...toWinAnsi("a → b ≤ c"))).toBe("a -> b <= c");
		expect(toWinAnsi("漢")).toEqual([63]);
	});

	it("Breite nach Helvetica-AFM", () => {
		expect(textWidth(toWinAnsi("Hello"), "regular", 10)).toBeCloseTo(22.78);
		expect(textWidth(toWinAnsi("Hello"), "bold", 10)).toBeCloseTo(
			(722 + 556 + 278 + 278 + 611) / 100,
		);
	});
});

describe("Zeilenumbruch", () => {
	it("bricht nach Breite und hält Wörter zusammen", () => {
		const lines = wrapText("eins zwei drei vier fünf", "regular", 10, 60);
		expect(lines.length).toBeGreaterThan(1);
		for (const l of lines)
			expect(textWidth(l, "regular", 10)).toBeLessThanOrEqual(60);
		expect(lines.map((l) => String.fromCharCode(...l)).join(" ")).toBe(
			"eins zwei drei vier fünf",
		);
	});

	it("trennt überlange Wörter hart, Zeilenumbrüche im Text bleiben", () => {
		const lines = wrapText("a".repeat(200), "regular", 10, 100);
		expect(lines.length).toBeGreaterThan(3);
		expect(lines.flat()).toHaveLength(200);
		expect(wrapText("eins\nzwei", "regular", 10, 500)).toHaveLength(2);
	});
});

describe("PDF-Writer", () => {
	it("gültiger Aufbau: Kopf, Querverweise stimmen, Trailer, EOF", () => {
		const pdf = renderPdf(doc(), { now: NOW });
		const s = latin1(pdf);
		expect(s.startsWith("%PDF-1.7\n")).toBe(true);
		expect(s.endsWith("%%EOF\n")).toBe(true);
		const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)?.[1]);
		expect(s.slice(startxref, startxref + 4)).toBe("xref");
		const [, count] = /xref\n0 (\d+)\n/.exec(s) ?? [];
		const entries = s
			.slice(startxref)
			.split("\n")
			.slice(3, 2 + Number(count));
		entries.forEach((e, i) => {
			const off = Number(e.slice(0, 10));
			expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(
				`${i + 1} 0 obj`,
			);
		});
		expect(s).toMatch(/\/Type \/Catalog \/Pages 2 0 R \/Lang \(de-DE\)/);
		expect(s).not.toMatch(/\/JavaScript|\/JS|\/OpenAction|\/URI/);
	});

	it("Texte in WinAnsi mit Escapes (Klammern, Backslash, Umlaute)", () => {
		const content = streams(renderPdf(doc(), { now: NOW })).join("\n");
		expect(content).toContain(
			"(Pr\\374fung \\204extern\\223 \\226 5 \\200) Tj",
		);
		expect(content).toContain("\\(Klammern\\)");
		expect(content).toContain("\\\\ Backslash");
		expect(content).toContain("(Seite 1 von 1) Tj");
		expect(content).toContain("(Datum, Unterschrift) Tj");
	});

	it("lange Tabellen gehen über Seiten, Kopf wird wiederholt", () => {
		const pdf = renderPdf(doc(150), { now: NOW });
		const s = latin1(pdf);
		const pages = Number(
			/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)?.[1],
		);
		expect(pages).toBeGreaterThan(3);
		const content = streams(pdf);
		expect(content).toHaveLength(pages);
		// Spaltenkopf „Thema“ auf jeder Seite mit Tabelle
		const withHeader = content.filter((c) => c.includes("/F2 8.3 Tf 0.15 g"));
		expect(withHeader.length).toBe(pages);
		expect(content.at(-1)).toContain(`(Seite ${pages} von ${pages}) Tj`);
		// ab Seite 2 Kopfzeile mit Organisation und Titel
		expect(content[1]).toContain("(Muster GmbH \\267 Kontextanalyse) Tj");
	});

	it("deterministisch bei gleichem Zeitpunkt", () => {
		const a = renderPdf(doc(), { now: NOW });
		const b = renderPdf(doc(), { now: NOW });
		expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
		expect(latin1(a)).toContain("/CreationDate (D:20261023120000Z)");
	});

	it("Anhang als eingebettete Datei (z. B. signaturen.json)", () => {
		const json = JSON.stringify({ v: 1, signatures: [] });
		const pdf = renderPdf(doc(), {
			now: NOW,
			attachments: [
				{ name: "signaturen.json", data: json, mime: "application/json" },
			],
		});
		const s = latin1(pdf);
		expect(s).toMatch(
			/\/EmbeddedFiles << \/Names \[\(signaturen\.json\) \d+ 0 R\]/,
		);
		expect(s).toContain("/Subtype /application#2Fjson");
		expect(streams(pdf)).toContain(json);
	});
});

describe("Markdown aus demselben Modell", () => {
	it("Überschriften, Tabellen, Unterschriften", () => {
		const md = renderMarkdown(doc(2));
		expect(md).toContain("# Kontextanalyse");
		expect(md).toContain("**Organisation:** Muster GmbH");
		expect(md).toContain("## Prüfung „extern“ – 5 €");
		expect(md).toContain("| Nr. | Thema |");
		expect(md).toContain("| K-2 | Thema 2 mit Text |");
		expect(md).toContain("| Geschäftsführung | E. Muster | offen |");
	});

	it("Pipes und Zeilenumbrüche in Zellen brechen die Tabelle nicht", () => {
		const md = renderMarkdown({
			title: "T",
			org: "O",
			meta: [],
			blocks: [
				{
					type: "table",
					columns: [{ label: "A" }],
					rows: [["x | y\nz"]],
				},
			],
		});
		expect(md).toContain("| x \\| y z |");
	});
});
