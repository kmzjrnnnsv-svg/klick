import { readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractText } from "@/lib/dlp/extract";
import { pdfText } from "@/lib/dlp/pdf-text";
import { renderPdf } from "@/lib/export/pdf";

// PDF-Leser im Parser (lib/dlp/pdf-text.ts): übliche Exporte lesen, ein
// Absatz je Zeile, ehrliche Grenzen (verschlüsselt, Scan, Zeichensalat) und
// keine Abstürze bei kaputten oder bösartigen Dateien.

const fixture = (name: string) =>
	new Uint8Array(readFileSync(path.join(__dirname, "fixtures/pdf", name)));
const ok = (r: ReturnType<typeof pdfText>) => {
	if (r.status !== "ok")
		throw new Error(`erwartet ok, war ${JSON.stringify(r)}`);
	return r.text.split("\n");
};

// kleines PDF von Hand: Objekte in Reihenfolge, Querverweise nicht nötig
function handPdf(objects: string[], trailer = "<< /Root 1 0 R >>"): Uint8Array {
	const body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
	return new Uint8Array(
		Buffer.from(`%PDF-1.7\n${body}trailer\n${trailer}\n%%EOF\n`, "latin1"),
	);
}
const stream = (dict: string, content: string) =>
	`<< ${dict} /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;

describe("PDF-Text: echte Exporte", () => {
	it("LibreOffice (wie Word): Absätze, Überschriften, Listen, Tabelle", () => {
		const lines = ok(pdfText(fixture("libreoffice-v1.pdf")));
		expect(lines[0]).toBe("Informationssicherheitsleitlinie");
		expect(lines[1]).toMatch(/^Diese Leitlinie gilt für alle Beschäftigten/);
		expect(lines[1]).toMatch(/nachvollziehbar dokumentiert werden\.$/);
		expect(lines).toContain("2. Geltungsbereich");
		// Silbentrennung im Original („Verfahrens­beschreibungen“) aufgelöst
		expect(lines.join(" ")).toContain("Verfahrensbeschreibungen ergänzen sie");
		expect(lines).toContain("• Erster Punkt");
		expect(lines).toContain("Rolle | Aufgabe");
		expect(lines).toContain("ISB | Berichten");
	});

	it("zweite Fassung: Unterschiede bleiben je Absatz", () => {
		const a = ok(pdfText(fixture("libreoffice-v1.pdf")));
		const b = ok(pdfText(fixture("libreoffice-v2.pdf")));
		const added = b.filter((l) => !a.includes(l));
		const removed = a.filter((l) => !b.includes(l));
		expect(added).toEqual([
			expect.stringContaining("halbjährlich überprüft"),
			"• Dritter Punkt neu",
			"DSB | Beraten",
		]);
		expect(removed).toEqual([expect.stringContaining("jährlich überprüft")]);
	});

	it("Chromium (Skia): Umlaute und Anführungszeichen", () => {
		const text = ok(pdfText(fixture("chromium.pdf"))).join("\n");
		expect(text).toContain("Größere Änderungen benötigen die Freigabe");
		expect(text).toContain("„intern“");
	});

	it("Klicks eigener PDF-Writer: Rundreise", () => {
		const pdf = renderPdf(
			{
				title: "RL-001 Leitlinie",
				org: "Muster GmbH",
				meta: [["Stand", "28.10.2026"]],
				blocks: [
					{ type: "heading", level: 1, text: "Zweck" },
					{
						type: "paragraph",
						text: "Ein langer Absatz, der über mehrere Zeilen umbricht und trotzdem als ein Absatz zurückkommen soll, damit der Vergleich nicht bei jedem Umbruch anschlägt. Euro 5 € – „Zitat“.",
					},
					{ type: "list", items: ["Punkt eins", "Punkt zwei"] },
				],
			},
			{ now: new Date("2026-10-28T10:00:00Z") },
		);
		const lines = ok(pdfText(pdf));
		expect(lines).toContain("Zweck");
		expect(lines).toContain(
			"Ein langer Absatz, der über mehrere Zeilen umbricht und trotzdem als ein Absatz zurückkommen soll, damit der Vergleich nicht bei jedem Umbruch anschlägt. Euro 5 € – „Zitat“.",
		);
		expect(lines).toContain("• Punkt eins");
	});
});

describe("PDF-Text: Grenzen", () => {
	it("verschlüsselt, nur Bild, kein PDF", () => {
		expect(pdfText(fixture("encrypted.pdf"))).toEqual({
			status: "unsupported",
			reason: "encrypted",
		});
		expect(pdfText(fixture("image-only.pdf"))).toEqual({ status: "no_text" });
		expect(pdfText(new Uint8Array([1, 2, 3]))).toEqual({
			status: "error",
			reason: "not_pdf",
		});
	});

	it("Objektstrom, Type0 mit ToUnicode (bfrange) und WinAnsi-Differences", () => {
		const cmap =
			"begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n" +
			"1 beginbfchar <0001> <00C4> endbfchar\n" +
			"1 beginbfrange <0010> <0012> <0061> endbfrange\nendcmap";
		const content =
			"BT /F1 12 Tf 72 700 Td <00010010> Tj ET\nBT /F2 12 Tf 72 640 Td (\\200x) Tj ET";
		// Objektstrom mit Seite (3) und Seitenbaum (2), Versätze ab /First
		const page =
			"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R /F2 7 0 R >> >> /Contents 6 0 R >> ";
		const pages = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
		const objstm = `3 0 2 ${page.length} `;
		const packed = `${objstm}${page}${pages}`;
		const z = deflateSync(Buffer.from(packed, "latin1")).toString("latin1");
		const pdf = handPdf([
			"<< /Type /Catalog /Pages 2 0 R >>",
			"null",
			"null",
			"null",
			"<< /Type /Font /Subtype /Type0 /ToUnicode 8 0 R >>",
			stream("", content),
			"<< /Type /Font /Subtype /Type1 /Encoding << /Differences [128 /Udieresis] >> >>",
			stream("", cmap),
			stream(
				`/Type /ObjStm /N 2 /First ${objstm.length} /Filter /FlateDecode`,
				z,
			),
		]);
		const lines = ok(pdfText(pdf));
		expect(lines).toEqual(["Äa", "Üx"]);
	});

	it("kaputte und bösartige Dateien: kein Absturz", () => {
		const good = fixture("libreoffice-v1.pdf");
		for (const cut of [10, 500, 5000, good.length - 50]) {
			const r = pdfText(good.subarray(0, cut));
			expect(["ok", "error", "no_text"]).toContain(r.status);
		}
		// Seitenbaum mit Zyklus
		const cycle = handPdf([
			"<< /Type /Catalog /Pages 2 0 R >>",
			"<< /Type /Pages /Kids [2 0 R 3 0 R] >>",
			"<< /Type /Pages /Kids [2 0 R] >>",
		]);
		expect(pdfText(cycle).status).toBe("error");
		// Entpack-Bombe: 64 MB Nullen, gekürzt auf die Grenze, kein Text
		const bomb = deflateSync(Buffer.alloc(64 * 1024 * 1024)).toString("latin1");
		const pdf = handPdf([
			"<< /Type /Catalog /Pages 2 0 R >>",
			"<< /Type /Pages /Kids [3 0 R] >>",
			"<< /Type /Page /Contents 4 0 R >>",
			stream("/Filter /FlateDecode", bomb),
		]);
		expect(["no_text", "error"]).toContain(pdfText(pdf).status);
	});

	it("extractText: PDF über den eigenen Leser, Bilder ohne Text", () => {
		const r = extractText(fixture("libreoffice-v1.pdf"), "application/pdf");
		expect(r.status).toBe("ok");
		expect(extractText(fixture("encrypted.pdf"), "application/pdf")).toEqual({
			status: "unsupported",
			reason: "encrypted",
		});
		expect(extractText(fixture("image-only.pdf"), "application/pdf")).toEqual({
			status: "unsupported",
			reason: "no_text",
		});
	});
});
