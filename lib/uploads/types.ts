// Gemeinsame Upload-Regeln für Browser und Server: dieselbe Grenze, dieselben
// Endungen — der Dialog lehnt ab, bevor 25 MB über die Leitung gehen, der
// Server prüft trotzdem selbst (lib/uploads/validate.ts).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// MIME → erlaubte Endungen. Binärformate werden per Magic Bytes verifiziert,
// Textformate auf lesbaren Text (haben keine Signatur).
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
	// Scan-Berichte (S5): SARIF und Nuclei-JSONL
	"application/sarif+json": [".sarif"],
	"application/x-ndjson": [".jsonl"],
};

export const TEXT_TYPES: ReadonlySet<string> = new Set([
	"text/plain",
	"text/csv",
	"application/json",
	"application/sarif+json",
	"application/x-ndjson",
]);

export const ALLOWED_EXTENSIONS: readonly string[] =
	Object.values(ALLOWED_TYPES).flat();

// Für <input accept="…">
export const UPLOAD_ACCEPT = ALLOWED_EXTENSIONS.join(",");

export type UploadRejectReason =
	| "too_large"
	| "empty"
	| "type_not_allowed"
	| "signature_mismatch"
	| "invalid_text";

export function extensionOf(name: string): string {
	const i = name.lastIndexOf(".");
	return i >= 0 ? name.slice(i).toLowerCase() : "";
}

// Schnelle Vorprüfung im Browser (Größe, Endung) — ersetzt nicht die
// Signaturprüfung auf dem Server.
export function precheckFile(
	file: { name: string; size: number },
	allowed: readonly string[] = ALLOWED_EXTENSIONS,
): UploadRejectReason | null {
	if (file.size === 0) return "empty";
	if (file.size > MAX_UPLOAD_BYTES) return "too_large";
	if (!allowed.includes(extensionOf(file.name))) return "type_not_allowed";
	return null;
}

// Titel aus dem Dateinamen: Endung weg, auf die Feldlänge gekürzt.
export function titleFromFileName(name: string, max = 200): string {
	const ext = extensionOf(name);
	const base = ext ? name.slice(0, -ext.length) : name;
	return base.trim().slice(0, max) || name.slice(0, max);
}

export function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
