// Standard-14-Schriften Helvetica (+ Bold, Oblique) mit WinAnsiEncoding:
// Breiten aus den Adobe-AFM-Dateien (1/1000 em) für die Codes 32–255 und die
// Abbildung Unicode → WinAnsi. Nicht eingebettet — jeder PDF-Betrachter
// bringt Helvetica bzw. eine metrisch gleiche Schrift mit.

export type PdfFontKey = "regular" | "bold" | "italic";

// Unicode → WinAnsi für die Codes 0x80–0x9F (Rest = Latin-1)
const CP1252: Record<number, number> = {
	8364: 0x80,
	8218: 0x82,
	402: 0x83,
	8222: 0x84,
	8230: 0x85,
	8224: 0x86,
	8225: 0x87,
	710: 0x88,
	8240: 0x89,
	352: 0x8a,
	8249: 0x8b,
	338: 0x8c,
	381: 0x8e,
	8216: 0x91,
	8217: 0x92,
	8220: 0x93,
	8221: 0x94,
	8226: 0x95,
	8211: 0x96,
	8212: 0x97,
	732: 0x98,
	8482: 0x99,
	353: 0x9a,
	8250: 0x9b,
	339: 0x9c,
	382: 0x9e,
	376: 0x9f,
};

// Zeichen ohne WinAnsi-Code: lesbarer Ersatz statt „?“
const FALLBACK: Record<string, string> = {
	"→": "->",
	"←": "<-",
	"↔": "<->",
	"⇒": "=>",
	"≤": "<=",
	"≥": ">=",
	"≠": "!=",
	"≈": "~",
	"−": "-",
	"‑": "-",
	"‐": "-",
	"✓": "x",
	"✔": "x",
	"✗": "-",
	"●": "•",
	"○": "o",
	"…": "…",
	" ": " ",
	" ": " ",
	" ": " ",
	"​": "",
	"‌": "",
	"‍": "",
	"﻿": "",
	"\t": "    ",
};

// Ein Unicode-Text → WinAnsi-Bytes (als Zahlen 32–255)
export function toWinAnsi(text: string): number[] {
	const out: number[] = [];
	for (const ch of text.normalize("NFC")) {
		const cp = ch.codePointAt(0) ?? 63;
		if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) {
			out.push(cp);
			continue;
		}
		const mapped = CP1252[cp];
		if (mapped !== undefined) {
			out.push(mapped);
			continue;
		}
		const fb = FALLBACK[ch];
		if (fb !== undefined) {
			for (const c of fb) {
				const x = c.codePointAt(0) ?? 63;
				out.push(CP1252[x] ?? (x <= 0xff ? x : 63));
			}
			continue;
		}
		if (cp === 0x0a || cp === 0x0d) continue;
		out.push(63); // „?“
	}
	return out;
}

// Breiten 32–126 (ASCII)
const ASCII_REGULAR = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
	278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
	584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
	833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
	278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
	500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
	500, 334, 260, 334, 584,
];
const ASCII_BOLD = [
	278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
	278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
	584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
	833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
	278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
	556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
	500, 389, 280, 389, 584,
];
// 0x80–0x9F (WinAnsi), nicht belegte Codes 0
const CP_REGULAR = [
	556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
	0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
];
const CP_BOLD = [
	556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
	0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
];
// 0xA0–0xFF (Latin-1)
const LATIN_REGULAR = [
	278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737,
	333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834,
	834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278,
	278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
	722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556,
	556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556,
	556, 556, 556, 500, 556, 500,
];
const LATIN_BOLD = [
	278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737,
	333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834,
	834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278,
	278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722,
	722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556,
	556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611,
	611, 611, 611, 556, 611, 556,
];

function table(ascii: number[], cp: number[], latin: number[]): number[] {
	// Index = Code − 32
	return [...ascii, 0, ...cp, ...latin];
}

// Breiten je Schrift, Index = WinAnsi-Code − 32 (32…255)
export const WIDTHS: Record<PdfFontKey, readonly number[]> = {
	regular: table(ASCII_REGULAR, CP_REGULAR, LATIN_REGULAR),
	bold: table(ASCII_BOLD, CP_BOLD, LATIN_BOLD),
	// Helvetica-Oblique hat die Breiten von Helvetica
	italic: table(ASCII_REGULAR, CP_REGULAR, LATIN_REGULAR),
};

export const BASE_FONT: Record<PdfFontKey, string> = {
	regular: "Helvetica",
	bold: "Helvetica-Bold",
	italic: "Helvetica-Oblique",
};

// Breite eines (WinAnsi-kodierten) Texts in Punkt
export function textWidth(
	codes: readonly number[],
	font: PdfFontKey,
	size: number,
): number {
	const w = WIDTHS[font];
	let sum = 0;
	for (const c of codes) sum += w[c - 32] || 556;
	return (sum * size) / 1000;
}
