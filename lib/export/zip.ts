import { createHash } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";

// ZIP-Writer ohne Abhängigkeit: PKZIP 2.0, Deflate, UTF-8-Namen (Flag 0x800),
// zentrales Verzeichnis. Reicht für Prüfungspakete (Text, CSV, Markdown,
// kleine Binärdateien); kein ZIP64 (Grenze 4 GB / 65 535 Einträge). Dazu ein
// Manifest mit SHA-256 je Datei — Prüfer:innen können jede Datei gegen das
// Manifest prüfen, das Manifest selbst steht als letzte Datei im Archiv.

export type ZipEntry = {
	name: string;
	data: Uint8Array | string;
	// Zeitstempel der Datei (DOS-Zeit, 2-Sekunden-Auflösung); Default: now.
	mtime?: Date;
};

export const ZIP_MAX_ENTRIES = 65_535;

function bytes(d: Uint8Array | string): Uint8Array {
	return typeof d === "string" ? new TextEncoder().encode(d) : d;
}

function dosDateTime(d: Date): { date: number; time: number } {
	const y = Math.max(1980, Math.min(2107, d.getUTCFullYear()));
	const date =
		((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
	const time =
		(d.getUTCHours() << 11) |
		(d.getUTCMinutes() << 5) |
		Math.floor(d.getUTCSeconds() / 2);
	return { date, time };
}

export function sha256Hex(data: Uint8Array | string): string {
	return createHash("sha256").update(bytes(data)).digest("hex");
}

// Namen normalisieren: keine führenden Slashes, keine Rückwärts-Pfade,
// Backslashes zu Slashes — ein Archiv darf nie außerhalb des Zielordners
// schreiben (Zip-Slip).
export function safeZipName(name: string): string {
	const parts = name
		.replaceAll("\\", "/")
		.split("/")
		.map((p) => p.trim())
		.filter((p) => p !== "" && p !== "." && p !== "..");
	const joined = Array.from(parts.join("/"), (ch) =>
		ch.charCodeAt(0) < 32 || '"<>|:*?'.includes(ch) ? "_" : ch,
	).join("");
	return joined.length === 0 ? "datei" : joined;
}

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
	if (entries.length > ZIP_MAX_ENTRIES)
		throw new Error(`zip: zu viele Einträge (${entries.length})`);
	const now = new Date();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;
	const seen = new Set<string>();
	for (const e of entries) {
		let name = safeZipName(e.name);
		// Duplikate deterministisch entschärfen, statt still zu überschreiben.
		let n = 1;
		while (seen.has(name)) name = `${safeZipName(e.name)}.${++n}`;
		seen.add(name);
		const nameBytes = new TextEncoder().encode(name);
		const raw = bytes(e.data);
		const compressed = deflateRawSync(raw, { level: 6 });
		// Deflate lohnt sich nicht immer; dann unkomprimiert speichern (Methode 0).
		const useDeflate = compressed.byteLength < raw.byteLength;
		const payload = useDeflate ? new Uint8Array(compressed) : raw;
		const method = useDeflate ? 8 : 0;
		const crc = crc32(raw) >>> 0;
		const { date, time } = dosDateTime(e.mtime ?? now);

		const local = new Uint8Array(30 + nameBytes.byteLength);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true); // version needed 2.0
		lv.setUint16(6, 0x0800, true); // UTF-8 names
		lv.setUint16(8, method, true);
		lv.setUint16(10, time, true);
		lv.setUint16(12, date, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, payload.byteLength, true);
		lv.setUint32(22, raw.byteLength, true);
		lv.setUint16(26, nameBytes.byteLength, true);
		lv.setUint16(28, 0, true);
		local.set(nameBytes, 30);

		const central = new Uint8Array(46 + nameBytes.byteLength);
		const cv = new DataView(central.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 0x0314, true); // made by: UNIX, 2.0
		cv.setUint16(6, 20, true);
		cv.setUint16(8, 0x0800, true);
		cv.setUint16(10, method, true);
		cv.setUint16(12, time, true);
		cv.setUint16(14, date, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, payload.byteLength, true);
		cv.setUint32(24, raw.byteLength, true);
		cv.setUint16(28, nameBytes.byteLength, true);
		cv.setUint16(30, 0, true); // extra
		cv.setUint16(32, 0, true); // comment
		cv.setUint16(34, 0, true); // disk
		cv.setUint16(36, 0, true); // internal attrs
		cv.setUint32(38, 0o100644 << 16, true); // external attrs: -rw-r--r--
		cv.setUint32(42, offset, true);
		central.set(nameBytes, 46);

		locals.push(local, payload);
		centrals.push(central);
		offset += local.byteLength + payload.byteLength;
	}
	const centralSize = centrals.reduce((s, c) => s + c.byteLength, 0);
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(4, 0, true);
	ev.setUint16(6, 0, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);
	ev.setUint16(20, 0, true);

	const total = offset + centralSize + eocd.byteLength;
	const out = new Uint8Array(total);
	let pos = 0;
	for (const chunk of [...locals, ...centrals, eocd]) {
		out.set(chunk, pos);
		pos += chunk.byteLength;
	}
	return out;
}

export type ManifestInput = {
	title: string;
	generatedAt: Date;
	organization: { id: string; name: string };
	period?: { from: string | null; to: string | null } | null;
	frameworks?: readonly string[];
	generator?: string;
	extra?: Record<string, unknown>;
};

export type Manifest = {
	title: string;
	generatedAt: string;
	organization: { id: string; name: string };
	period: { from: string | null; to: string | null } | null;
	frameworks: string[];
	generator: string;
	files: { name: string; bytes: number; sha256: string }[];
	extra?: Record<string, unknown>;
};

// Manifest (JSON + sha256sum-kompatible Textliste) über alle Einträge; wird
// dem Archiv angehängt. Reihenfolge der Dateien bleibt wie übergeben.
export function withManifest(
	entries: readonly ZipEntry[],
	input: ManifestInput,
): { entries: ZipEntry[]; manifest: Manifest } {
	const files = entries.map((e) => {
		const data = bytes(e.data);
		return {
			name: safeZipName(e.name),
			bytes: data.byteLength,
			sha256: sha256Hex(data),
		};
	});
	const manifest: Manifest = {
		title: input.title,
		generatedAt: input.generatedAt.toISOString(),
		organization: input.organization,
		period: input.period ?? null,
		frameworks: [...(input.frameworks ?? [])],
		generator: input.generator ?? "Klick",
		files,
		...(input.extra ? { extra: input.extra } : {}),
	};
	const sums = `${files.map((f) => `${f.sha256}  ${f.name}`).join("\n")}\n`;
	return {
		manifest,
		entries: [
			...entries,
			{
				name: "MANIFEST.json",
				data: `${JSON.stringify(manifest, null, 2)}\n`,
				mtime: input.generatedAt,
			},
			{ name: "SHA256SUMS", data: sums, mtime: input.generatedAt },
		],
	};
}
