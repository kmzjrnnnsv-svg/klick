import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetUrl } from "@/lib/marketing/asset-url";
import { SHOTS } from "@/lib/marketing/shots";

// Website-Bilder: Maße in lib/marketing/shots.ts stimmen mit den Dateien
// überein (sonst springt das Layout beim Laden), und neue Bilder bekommen
// eine neue URL (nginx cacht Bilder 7 Tage als immutable).

// Breite und Höhe aus dem ersten SOF-Segment einer JPEG-Datei
function jpegSize(bytes: Buffer): { w: number; h: number } {
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("kein JPEG");
	let i = 2;
	while (i + 9 < bytes.length) {
		if (bytes[i] !== 0xff) {
			i++;
			continue;
		}
		const marker = bytes[i + 1];
		const length = bytes.readUInt16BE(i + 2);
		const sof =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (sof)
			return { h: bytes.readUInt16BE(i + 5), w: bytes.readUInt16BE(i + 7) };
		i += 2 + length;
	}
	throw new Error("kein SOF-Segment");
}

describe("Website-Bilder", () => {
	it.each(Object.entries(SHOTS))("%s: Maße passen zur Datei", (_, shot) => {
		const bytes = readFileSync(join(process.cwd(), "public", shot.src));
		expect(jpegSize(bytes)).toEqual({ w: shot.w, h: shot.h });
	});

	it("hängt die Prüfsumme des Inhalts an die URL", () => {
		const url = assetUrl(SHOTS.risiko.src);
		expect(url).toMatch(/^\/funktionen\/risiko\.jpg\?v=[0-9a-f]{10}$/);
		expect(assetUrl(SHOTS.risiko.src)).toBe(url);
		expect(assetUrl("/gibt-es-nicht.jpg")).toBe("/gibt-es-nicht.jpg");
	});
});
