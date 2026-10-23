import { describe, expect, it } from "vitest";
import { attachmentHeaders } from "@/lib/evidence/read";
import { asciiFileName, contentDisposition } from "@/lib/http/disposition";

// Downloads mit Gedankenstrich, Emoji oder Umlaut im Dateinamen endeten in
// einem 500er: Header-Werte dürfen keine Zeichen über U+00FF enthalten.
describe("Content-Disposition", () => {
	it("übersteht Namen mit Zeichen über U+00FF", () => {
		for (const name of [
			"Bericht – 2026.pdf",
			"Prüfung 📎.docx",
			"Ölpreis „Q3“.xlsx",
			'a"b\r\nc.txt',
			"",
		]) {
			const h = attachmentHeaders(name, "application/pdf", 3);
			expect(() => new Headers(h)).not.toThrow();
		}
	});

	it("ASCII-Rückfall plus UTF-8 im filename*", () => {
		expect(asciiFileName("Prüfung – Größe.pdf")).toBe("Pruefung _ Groesse.pdf");
		expect(asciiFileName("café.txt")).toBe("cafe.txt");
		const v = contentDisposition("Prüfung – 2026.pdf");
		expect(v).toContain('filename="Pruefung _ 2026.pdf"');
		expect(v).toContain(
			`filename*=UTF-8''${encodeURIComponent("Prüfung – 2026.pdf")}`,
		);
		expect(contentDisposition('x"\r\n.md')).not.toMatch(/[\r\n]/);
	});
});
