import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	buildZip,
	safeZipName,
	sha256Hex,
	withManifest,
} from "@/lib/export/zip";

// Minimaler ZIP-Leser für den Test: zentrales Verzeichnis lesen, lokale
// Header prüfen, Inhalt entpacken und CRC vergleichen.
function readZip(buf: Uint8Array) {
	const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	const eocd = buf.byteLength - 22;
	expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
	const count = dv.getUint16(eocd + 10, true);
	let pos = dv.getUint32(eocd + 16, true);
	const out: { name: string; data: Uint8Array; method: number }[] = [];
	for (let i = 0; i < count; i++) {
		expect(dv.getUint32(pos, true)).toBe(0x02014b50);
		const method = dv.getUint16(pos + 10, true);
		const crc = dv.getUint32(pos + 16, true);
		const csize = dv.getUint32(pos + 20, true);
		const usize = dv.getUint32(pos + 24, true);
		const nlen = dv.getUint16(pos + 28, true);
		const local = dv.getUint32(pos + 42, true);
		const name = new TextDecoder().decode(
			buf.subarray(pos + 46, pos + 46 + nlen),
		);
		expect(dv.getUint32(local, true)).toBe(0x04034b50);
		const lnlen = dv.getUint16(local + 26, true);
		const start = local + 30 + lnlen;
		const payload = buf.subarray(start, start + csize);
		const data =
			method === 8 ? new Uint8Array(inflateRawSync(payload)) : payload;
		expect(data.byteLength).toBe(usize);
		expect(crc32(data) >>> 0).toBe(crc);
		out.push({ name, data, method });
		pos += 46 + nlen;
	}
	return out;
}

describe("zip", () => {
	it("Roundtrip: Deflate für Text, Store für Zufallsbytes, CRC stimmt", () => {
		const random = new Uint8Array(512);
		for (let i = 0; i < random.length; i++) random[i] = (i * 7919) % 256;
		const text = "Prüfungspaket — Zeile\n".repeat(50);
		const zip = buildZip([
			{ name: "README.md", data: text },
			{ name: "bin/zufall.bin", data: random },
			{ name: "leer.txt", data: "" },
		]);
		const files = readZip(zip);
		expect(files.map((f) => f.name)).toEqual([
			"README.md",
			"bin/zufall.bin",
			"leer.txt",
		]);
		expect(new TextDecoder().decode(files[0]?.data)).toBe(text);
		expect(files[0]?.method).toBe(8);
		expect(files[1]?.data).toEqual(random);
		expect(files[2]?.data.byteLength).toBe(0);
	});

	it("Namen: Zip-Slip entschärft, Duplikate nummeriert", () => {
		expect(safeZipName("../../etc/passwd")).toBe("etc/passwd");
		expect(safeZipName("/abs\\win\\pfad.txt")).toBe("abs/win/pfad.txt");
		expect(safeZipName("a:b*c?.csv")).toBe("a_b_c_.csv");
		const files = readZip(
			buildZip([
				{ name: "x.txt", data: "1" },
				{ name: "x.txt", data: "2" },
			]),
		);
		expect(files.map((f) => f.name)).toEqual(["x.txt", "x.txt.2"]);
	});

	it("Manifest: SHA-256 je Datei, sha256sum-Format, Metadaten", () => {
		const at = new Date("2026-10-07T12:00:00Z");
		const { entries, manifest } = withManifest(
			[{ name: "soa.md", data: "# SoA\n" }],
			{
				title: "Prüfungspaket",
				generatedAt: at,
				organization: { id: "org-1", name: "Test GmbH" },
				period: { from: "2026-01-01", to: "2026-06-30" },
				frameworks: ["iso27001", "dora"],
			},
		);
		expect(manifest.files).toEqual([
			{ name: "soa.md", bytes: 6, sha256: sha256Hex("# SoA\n") },
		]);
		expect(manifest.period).toEqual({ from: "2026-01-01", to: "2026-06-30" });
		expect(entries.map((e) => e.name)).toEqual([
			"soa.md",
			"MANIFEST.json",
			"SHA256SUMS",
		]);
		const sums = entries[2]?.data as string;
		expect(sums).toBe(`${sha256Hex("# SoA\n")}  soa.md\n`);
		const parsed = JSON.parse(entries[1]?.data as string);
		expect(parsed.generatedAt).toBe("2026-10-07T12:00:00.000Z");
		expect(parsed.organization.name).toBe("Test GmbH");
	});
});
