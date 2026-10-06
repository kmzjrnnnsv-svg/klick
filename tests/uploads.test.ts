import { describe, expect, it } from "vitest";
import {
	MAX_UPLOAD_BYTES,
	safeFileName,
	validateUpload,
} from "@/lib/uploads/validate";

const pdf = new TextEncoder().encode(
	"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n",
);
const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, ...new Array(64).fill(0)]);
const png = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
		"base64",
	),
);

describe("validateUpload", () => {
	it("akzeptiert ein echtes PDF", async () => {
		const res = await validateUpload({ name: "Richtlinie.pdf", bytes: pdf });
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.mime).toBe("application/pdf");
	});
	it("lehnt eine EXE mit PDF-Endung ab (Magic Bytes)", async () => {
		const res = await validateUpload({ name: "harmlos.pdf", bytes: exe });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.reason).toBe("signature_mismatch");
	});
	it("lehnt PNG mit falscher Endung ab, akzeptiert mit richtiger", async () => {
		expect((await validateUpload({ name: "x.jpg", bytes: png })).ok).toBe(
			false,
		);
		expect((await validateUpload({ name: "x.png", bytes: png })).ok).toBe(true);
	});
	it("Textdateien müssen UTF-8 sein und dürfen keine Binärsignatur tragen", async () => {
		expect(
			(
				await validateUpload({
					name: "a.txt",
					bytes: new TextEncoder().encode("hallo"),
				})
			).ok,
		).toBe(true);
		const bad = await validateUpload({
			name: "a.txt",
			bytes: Uint8Array.from([0xff, 0xfe, 0xfd]),
		});
		expect(bad.ok).toBe(false);
		const sneaky = await validateUpload({ name: "a.txt", bytes: pdf });
		expect(sneaky.ok).toBe(false);
	});
	it("lehnt nicht erlaubte Endungen, leere und zu große Dateien ab", async () => {
		expect((await validateUpload({ name: "x.svg", bytes: pdf })).ok).toBe(
			false,
		);
		expect(
			(await validateUpload({ name: "x.pdf", bytes: new Uint8Array() })).ok,
		).toBe(false);
		const huge = await validateUpload({
			name: "x.pdf",
			bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
		});
		expect(huge.ok).toBe(false);
		if (!huge.ok) expect(huge.reason).toBe("too_large");
	});
	it("normalisiert Dateinamen", () => {
		expect(safeFileName("../../etc/passwd")).toBe("passwd");
		expect(safeFileName("..\\..\\win.ini")).toBe("win.ini");
		expect(safeFileName(".hidden\u0000.pdf")).toBe("hidden.pdf");
		expect(safeFileName("")).toBe("datei");
	});
});
