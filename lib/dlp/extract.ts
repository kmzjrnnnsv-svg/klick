import { MAX_TEXT_CHARS } from "@/lib/uploads/limits";
import { readZipEntries } from "@/lib/uploads/zip-read";
import { pdfText } from "./pdf-text";

// Text aus einem Upload für die Inhaltsprüfung (DLP) und den Vergleich von
// Fassungen. Textformate direkt, Office-Formate (OOXML) über den eigenen
// ZIP-Leser, XML grob entmarkiert, PDF über den eigenen PDF-Leser
// (pdf-text.ts). Ein Absatz je Zeile. Bilder, Scans und verschlüsselte PDFs
// werden nicht inhaltlich geprüft — das Ergebnis sagt das offen
// („unsupported“ mit Grund), statt Sicherheit vorzutäuschen.

export const MAX_SCAN_CHARS = MAX_TEXT_CHARS;

export type Extraction =
	| { status: "ok"; text: string; truncated: boolean }
	| { status: "unsupported"; reason?: "encrypted" | "no_text" }
	| { status: "error"; reason: string };

const OOXML_PARTS: Record<string, RegExp> = {
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		/^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/,
};

const TEXT_MIMES = new Set([
	"text/plain",
	"text/csv",
	"application/json",
	"application/sarif+json",
	"application/x-ndjson",
]);

function decodeEntities(s: string): string {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) =>
			String.fromCodePoint(Number.parseInt(h, 16)),
		)
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

// Absatz-, Zeilen- und Zellgrenzen als Leerraum erhalten, damit Muster nicht
// über Zellen hinweg zusammenkleben (oder auseinanderfallen).
export function xmlToText(xml: string): string {
	return decodeEntities(
		xml
			.replace(/<\/(w:p|a:p|row)>/g, "\n")
			.replace(/<(w:tab|w:br)\s*\/>/g, " ")
			.replace(/<\/(c|si|w:tc)>/g, " ")
			.replace(/<[^>]+>/g, ""),
	);
}

function cap(text: string): { text: string; truncated: boolean } {
	return text.length > MAX_SCAN_CHARS
		? { text: text.slice(0, MAX_SCAN_CHARS), truncated: true }
		: { text, truncated: false };
}

export function extractText(bytes: Uint8Array, mime: string): Extraction {
	if (TEXT_MIMES.has(mime)) {
		return {
			status: "ok",
			...cap(new TextDecoder("utf-8").decode(bytes)),
		};
	}
	if (mime === "application/pdf") {
		const r = pdfText(bytes);
		if (r.status === "ok")
			return {
				status: "ok",
				...cap(r.text),
				truncated: r.truncated || r.text.length > MAX_SCAN_CHARS,
			};
		if (r.status === "no_text")
			return { status: "unsupported", reason: "no_text" };
		if (r.status === "unsupported")
			return { status: "unsupported", reason: r.reason };
		return { status: "error", reason: r.reason };
	}
	const parts = OOXML_PARTS[mime];
	// Bilder tragen keinen Text (OCR gibt es nicht)
	if (!parts)
		return mime.startsWith("image/")
			? { status: "unsupported", reason: "no_text" }
			: { status: "unsupported" };
	const zip = readZipEntries(bytes, (name) => parts.test(name));
	if (!zip.ok) return { status: "error", reason: zip.reason };
	const decoder = new TextDecoder("utf-8");
	const text = zip.entries
		.map((e) => xmlToText(decoder.decode(e.data)))
		.join("\n");
	return { status: "ok", ...cap(text) };
}
