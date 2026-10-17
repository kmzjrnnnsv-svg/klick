import { inflateRawSync } from "node:zlib";

// Minimaler ZIP-Leser für die Inhaltsprüfung (DLP) von Office-Dateien
// (docx/xlsx/pptx sind ZIP-Container). Bewusst ohne Abhängigkeit (vgl.
// ADR-014, eigener ZIP-Writer) und mit harten Grenzen gegen Zip-Bomben:
// Zahl der Einträge, Größe je Eintrag und gesamt, Kompressionsrate. ZIP64,
// verschlüsselte Einträge und unbekannte Methoden gelten als „nicht prüfbar“
// — der Aufrufer entscheidet, was das bedeutet.

export type ZipLimits = {
	maxEntries: number;
	maxEntryBytes: number;
	maxTotalBytes: number;
	maxRatio: number;
};

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
	maxEntries: 5_000,
	maxEntryBytes: 32 * 1024 * 1024,
	maxTotalBytes: 64 * 1024 * 1024,
	maxRatio: 200,
};

export type ZipEntry = { name: string; data: Uint8Array };

export type ZipReadResult =
	| { ok: true; entries: ZipEntry[] }
	| {
			ok: false;
			reason:
				| "not_zip"
				| "zip64"
				| "too_many_entries"
				| "too_large"
				| "ratio"
				| "encrypted"
				| "method"
				| "corrupt";
	  };

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

function findEocd(view: DataView): number {
	const min = Math.max(0, view.byteLength - 22 - 0xffff);
	for (let i = view.byteLength - 22; i >= min; i--) {
		if (view.getUint32(i, true) === EOCD) return i;
	}
	return -1;
}

export function readZipEntries(
	bytes: Uint8Array,
	wanted: (name: string) => boolean,
	limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): ZipReadResult {
	if (bytes.byteLength < 22) return { ok: false, reason: "not_zip" };
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const eocd = findEocd(view);
	if (eocd < 0) return { ok: false, reason: "not_zip" };
	const count = view.getUint16(eocd + 10, true);
	const cdSize = view.getUint32(eocd + 12, true);
	const cdOffset = view.getUint32(eocd + 16, true);
	if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff)
		return { ok: false, reason: "zip64" };
	if (count > limits.maxEntries)
		return { ok: false, reason: "too_many_entries" };
	if (cdOffset + cdSize > bytes.byteLength)
		return { ok: false, reason: "corrupt" };

	const decoder = new TextDecoder("utf-8");
	const entries: ZipEntry[] = [];
	let total = 0;
	let p = cdOffset;
	for (let i = 0; i < count; i++) {
		if (p + 46 > bytes.byteLength || view.getUint32(p, true) !== CEN)
			return { ok: false, reason: "corrupt" };
		const flags = view.getUint16(p + 8, true);
		const method = view.getUint16(p + 10, true);
		const compSize = view.getUint32(p + 20, true);
		const size = view.getUint32(p + 24, true);
		const nameLen = view.getUint16(p + 28, true);
		const extraLen = view.getUint16(p + 30, true);
		const commentLen = view.getUint16(p + 32, true);
		const localOffset = view.getUint32(p + 42, true);
		const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
		p += 46 + nameLen + extraLen + commentLen;

		if (!wanted(name) || name.endsWith("/")) continue;
		if (size === 0xffffffff || compSize === 0xffffffff)
			return { ok: false, reason: "zip64" };
		if (flags & 0x1) return { ok: false, reason: "encrypted" };
		if (size > limits.maxEntryBytes) return { ok: false, reason: "too_large" };
		if (compSize > 0 && size / compSize > limits.maxRatio)
			return { ok: false, reason: "ratio" };
		total += size;
		if (total > limits.maxTotalBytes) return { ok: false, reason: "too_large" };

		if (
			localOffset + 30 > bytes.byteLength ||
			view.getUint32(localOffset, true) !== LOC
		)
			return { ok: false, reason: "corrupt" };
		const lNameLen = view.getUint16(localOffset + 26, true);
		const lExtraLen = view.getUint16(localOffset + 28, true);
		const start = localOffset + 30 + lNameLen + lExtraLen;
		if (start + compSize > bytes.byteLength)
			return { ok: false, reason: "corrupt" };
		const raw = bytes.subarray(start, start + compSize);

		let data: Uint8Array;
		if (method === 0) {
			data = raw;
		} else if (method === 8) {
			try {
				// maxOutputLength schützt auch dann, wenn die Größenangabe lügt.
				data = new Uint8Array(
					inflateRawSync(raw, { maxOutputLength: limits.maxEntryBytes }),
				);
			} catch {
				return { ok: false, reason: "corrupt" };
			}
		} else {
			return { ok: false, reason: "method" };
		}
		if (data.byteLength !== size) return { ok: false, reason: "corrupt" };
		entries.push({ name, data });
	}
	return { ok: true, entries };
}
