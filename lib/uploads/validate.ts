import { fileTypeFromBuffer } from "file-type";
import { decodeText } from "./text";
import {
	ALLOWED_TYPES,
	extensionOf,
	MAX_UPLOAD_BYTES,
	TEXT_TYPES,
	type UploadRejectReason,
} from "./types";

// Upload-Härtung: MIME-Allowlist + Magic-Bytes-Prüfung (`file-type`), harte
// Größengrenze, normalisierter Dateiname. Was hier durchfällt, wird nie in
// S3 geschrieben. Auslieferung erfolgt immer als Attachment (außer der
// sandboxed PDF-Vorschau in P2).

export { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "./types";

// OOXML ist ein ZIP — Signatur allein sagt nichts. Ein echtes Office-Dokument
// hat [Content_Types].xml und den Hauptteil des jeweiligen Formats; Dateinamen
// stehen unkomprimiert in den ZIP-Headern.
const OOXML_MAIN_PART: Record<string, string> = {
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"word/document.xml",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		"xl/workbook.xml",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"ppt/presentation.xml",
};

function containsAscii(bytes: Uint8Array, needle: string): boolean {
	return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(
		needle,
		0,
		"latin1",
	);
}

export type UploadValidation =
	| { ok: true; mime: string; ext: string; safeName: string; size: number }
	| {
			ok: false;
			reason: UploadRejectReason;
			detail?: string;
	  };

export function safeFileName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? "datei";
	const normalized = Array.from(base.normalize("NFC"))
		// Steuerzeichen, Nullbytes und Bidi-Steuerzeichen raus (sonst zeigt
		// „rechnung‮fdp.exe“ in der Liste „rechnungexe.pdf“)
		.filter((ch) => {
			const c = ch.charCodeAt(0);
			if (c <= 0x1f || c === 0x7f) return false;
			if (c >= 0x202a && c <= 0x202e) return false;
			if (c >= 0x2066 && c <= 0x2069) return false;
			return c !== 0x200e && c !== 0x200f && c !== 0x061c;
		})
		.join("")
		.replace(/^\.+/, "")
		.trim();
	const trimmed = normalized.length > 120 ? normalized.slice(-120) : normalized;
	return trimmed || "datei";
}

export async function validateUpload(input: {
	name: string;
	bytes: Uint8Array;
	declaredMime?: string;
}): Promise<UploadValidation> {
	const size = input.bytes.byteLength;
	if (size === 0) return { ok: false, reason: "empty" };
	if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };

	const safeName = safeFileName(input.name);
	const ext = extensionOf(safeName);

	// Welcher erlaubte MIME passt zur Endung?
	const mimeByExt = Object.entries(ALLOWED_TYPES).find(([, exts]) =>
		exts.includes(ext),
	)?.[0];
	if (!mimeByExt) {
		return { ok: false, reason: "type_not_allowed", detail: ext || "(keine)" };
	}

	if (TEXT_TYPES.has(mimeByExt)) {
		// UTF-8, UTF-16 mit BOM oder Windows-1252 — Hauptsache lesbarer Text.
		if (!decodeText(input.bytes)) {
			return { ok: false, reason: "invalid_text" };
		}
		// Textdateien dürfen keine bekannte Binärsignatur tragen (z. B. .txt
		// mit PE-/ELF-/PDF-Header).
		const sniffed = await fileTypeFromBuffer(input.bytes);
		if (sniffed) {
			return {
				ok: false,
				reason: "signature_mismatch",
				detail: `${ext} enthält ${sniffed.mime}`,
			};
		}
		return { ok: true, mime: mimeByExt, ext, safeName, size };
	}

	const sniffed = await fileTypeFromBuffer(input.bytes);
	if (!sniffed) {
		return {
			ok: false,
			reason: "signature_mismatch",
			detail: "keine Signatur",
		};
	}
	// OOXML (docx/xlsx/pptx) wird von file-type teils nur als zip erkannt.
	const sniffedMime =
		sniffed.mime === "application/zip" ? mimeByExt : sniffed.mime;
	if (sniffedMime !== mimeByExt) {
		return {
			ok: false,
			reason: "signature_mismatch",
			detail: `${ext} ist tatsächlich ${sniffed.mime}`,
		};
	}
	if (sniffed.mime === "application/zip") {
		const mainPart = OOXML_MAIN_PART[mimeByExt];
		if (
			!mainPart ||
			!containsAscii(input.bytes, "[Content_Types].xml") ||
			!containsAscii(input.bytes, mainPart)
		) {
			return { ok: false, reason: "signature_mismatch", detail: "zip" };
		}
	}
	return { ok: true, mime: mimeByExt, ext, safeName, size };
}
