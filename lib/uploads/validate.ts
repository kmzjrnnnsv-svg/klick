import { fileTypeFromBuffer } from "file-type";

// Upload-Härtung: MIME-Allowlist + Magic-Bytes-Prüfung (`file-type`), harte
// Größengrenze, normalisierter Dateiname. Was hier durchfällt, wird nie in
// S3 geschrieben. Auslieferung erfolgt immer als Attachment (außer der
// sandboxed PDF-Vorschau in P2).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// MIME → erlaubte Endungen. Binärformate werden per Magic Bytes verifiziert,
// Textformate per UTF-8-Validität (haben keine Signatur).
export const ALLOWED_TYPES: Record<string, readonly string[]> = {
	"application/pdf": [".pdf"],
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
		".docx",
	],
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
		".xlsx",
	],
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": [
		".pptx",
	],
	"image/png": [".png"],
	"image/jpeg": [".jpg", ".jpeg"],
	"text/plain": [".txt", ".md"],
	"text/csv": [".csv"],
	"application/json": [".json"],
};

const TEXT_TYPES = new Set(["text/plain", "text/csv", "application/json"]);

export type UploadValidation =
	| { ok: true; mime: string; ext: string; safeName: string; size: number }
	| {
			ok: false;
			reason:
				| "too_large"
				| "empty"
				| "type_not_allowed"
				| "signature_mismatch"
				| "invalid_text";
			detail?: string;
	  };

export function safeFileName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? "datei";
	const normalized = Array.from(base.normalize("NFC"))
		// Steuerzeichen und Nullbytes raus
		.filter((ch) => {
			const c = ch.charCodeAt(0);
			return c > 0x1f && c !== 0x7f;
		})
		.join("")
		.replace(/^\.+/, "")
		.trim();
	const trimmed = normalized.length > 120 ? normalized.slice(-120) : normalized;
	return trimmed || "datei";
}

function extensionOf(name: string): string {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isValidUtf8(bytes: Uint8Array): boolean {
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
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
		if (!isValidUtf8(input.bytes)) {
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
	if (
		sniffed.mime === "application/zip" &&
		!mimeByExt.startsWith("application/vnd.openxmlformats")
	) {
		return { ok: false, reason: "signature_mismatch", detail: "zip" };
	}
	return { ok: true, mime: mimeByExt, ext, safeName, size };
}
