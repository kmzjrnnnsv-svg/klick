import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { field, headerKey, parseCsv, toIsoDate } from "@/lib/csv";
import { attachmentDisposition } from "@/lib/http/responses";
import { decodeText } from "@/lib/uploads/text";
import {
	precheckFile,
	titleFromFileName,
	UPLOAD_ACCEPT,
} from "@/lib/uploads/types";
import { safeFileName, validateUpload } from "@/lib/uploads/validate";

const win1252 = (s: string) =>
	Uint8Array.from(
		[...s].map((ch) => {
			const map: Record<string, number> = {
				ä: 0xe4,
				ö: 0xf6,
				ü: 0xfc,
				ß: 0xdf,
				"€": 0x80,
			};
			return map[ch] ?? ch.charCodeAt(0);
		}),
	);

// Minimal-ZIP mit gegebenen Dateinamen (lokale Header genügen für file-type
// und die Inhaltsprüfung).
function zipWith(names: string[]): Uint8Array {
	const parts: Buffer[] = [];
	for (const name of names) {
		const data = deflateRawSync(Buffer.from("<x/>"));
		const h = Buffer.alloc(30);
		h.writeUInt32LE(0x04034b50, 0);
		h.writeUInt16LE(20, 4);
		h.writeUInt16LE(8, 8);
		h.writeUInt32LE(data.length, 18);
		h.writeUInt32LE(4, 22);
		h.writeUInt16LE(Buffer.byteLength(name), 26);
		parts.push(h, Buffer.from(name), data);
	}
	return new Uint8Array(Buffer.concat(parts));
}

describe("decodeText", () => {
	it("UTF-8, UTF-16 mit BOM und Windows-1252", () => {
		expect(decodeText(new TextEncoder().encode("Müller"))?.encoding).toBe(
			"utf-8",
		);
		const le = Buffer.concat([
			Buffer.from([0xff, 0xfe]),
			Buffer.from("Müller", "utf16le"),
		]);
		expect(decodeText(new Uint8Array(le))).toEqual({
			text: "Müller",
			encoding: "utf-16le",
		});
		expect(decodeText(win1252("Müller;Straße;5 €"))).toEqual({
			text: "Müller;Straße;5 €",
			encoding: "windows-1252",
		});
	});
	it("Binärdaten sind kein Text", () => {
		expect(decodeText(Uint8Array.from([0x4d, 0x5a, 0x00, 0x01]))).toBeNull();
		expect(decodeText(Uint8Array.from([0xff, 0xfe, 0xfd]))).toBeNull();
	});
});

describe("Upload-Prüfung", () => {
	it("Windows-CSV wird als Nachweis angenommen", async () => {
		const res = await validateUpload({
			name: "benutzer.csv",
			bytes: win1252("name;abteilung\nMüller;Prüfung\n"),
		});
		expect(res.ok).toBe(true);
	});
	it("ZIP mit .docx-Endung ohne Word-Inhalt wird abgelehnt", async () => {
		const res = await validateUpload({
			name: "richtlinie.docx",
			bytes: zipWith(["payload.exe", "readme.txt"]),
		});
		expect(res.ok).toBe(false);
	});
	it("Bidi-Steuerzeichen verschwinden aus Dateinamen", () => {
		expect(safeFileName("rechnung‮fdp.exe")).toBe("rechnungfdp.exe");
	});
	it("Vorprüfung im Browser deckt sich mit der Allow-List", () => {
		expect(UPLOAD_ACCEPT).toContain(".md");
		expect(precheckFile({ name: "a.pdf", size: 10 })).toBeNull();
		expect(precheckFile({ name: "a.exe", size: 10 })).toBe("type_not_allowed");
		expect(precheckFile({ name: "a.pdf", size: 0 })).toBe("empty");
		expect(precheckFile({ name: "a.pdf", size: 26 * 1024 * 1024 })).toBe(
			"too_large",
		);
		expect(titleFromFileName("Richtlinie IT-Sicherheit.pdf")).toBe(
			"Richtlinie IT-Sicherheit",
		);
		expect(titleFromFileName(`${"x".repeat(300)}.pdf`)).toHaveLength(200);
	});
});

describe("Content-Disposition", () => {
	it("Header bleibt Latin-1, echter Name in filename*", () => {
		const h = attachmentDisposition("Prüfbericht – „final“ €.pdf");
		// Würde sonst in new Headers() werfen (ByteString)
		expect(() => new Headers({ "Content-Disposition": h })).not.toThrow();
		expect(h).toContain('filename="Prufbericht _ _final_ _.pdf"');
		expect(h).toContain(
			`filename*=UTF-8''${encodeURIComponent("Prüfbericht – „final“ €.pdf")}`,
		);
	});
});

describe("CSV-Import robust", () => {
	it("Spaltennamen tolerant, deutsche Aliase", () => {
		const t = parseCsv(
			"Titel;Kritikalität;Vertragsende\nA;kritisch;31.12.2026\n",
		);
		expect(headerKey("Kritikalität")).toBe("kritikalitaet");
		expect(field(t.rows[0] ?? {}, "criticality", "kritikalität")).toBe(
			"kritisch",
		);
		expect(field(t.rows[0] ?? {}, "title", "titel")).toBe("A");
		expect(toIsoDate("31.12.2026")).toBe("2026-12-31");
		expect(toIsoDate("1.2.27")).toBe("2027-02-01");
		expect(toIsoDate("2026-12-31")).toBe("2026-12-31");
	});
	it("sep=-Zeile, Tab-Trenner und echte Zeilennummern", () => {
		const t = parseCsv('sep=,\nname,typ\n\n"Server\nA",system\nDB,data\n');
		expect(t.sep).toBe(",");
		expect(t.rows.map((r) => r.name)).toEqual(["Server\nA", "DB"]);
		expect(t.lines).toEqual([4, 6]);
		expect(parseCsv("a\tb\n1\t2\n").sep).toBe("\t");
	});
	it("einzelnes Anführungszeichen mitten in der Zelle verschluckt nichts", () => {
		const t = parseCsv('name;notiz\n12" Monitor;x\nB;y\n');
		expect(t.rows).toHaveLength(2);
		expect(t.rows[0]?.name).toBe('12" Monitor');
	});
});
