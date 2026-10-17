// Textdateien aus Windows/Excel kommen oft nicht als UTF-8: „CSV (Trennzeichen-
// getrennt)“ ist Windows-1252, PowerShell-Umleitungen sind UTF-16LE. Statt sie
// abzulehnen oder Umlaute zu zerstören, erkennen wir die Kodierung.

export type DecodedText = {
	text: string;
	encoding: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";
};

// In Windows-1252 nicht belegte Bytes und Steuerzeichen außer Tab/CR/LF —
// tauchen sie auf, ist es Binärzeug und kein Text.
const NOT_TEXT_1252 = new Set([
	0x81,
	0x8d,
	0x8f,
	0x90,
	0x9d,
	0x7f,
	...Array.from({ length: 32 }, (_, i) => i),
]);
for (const ok of [0x09, 0x0a, 0x0d]) NOT_TEXT_1252.delete(ok);

// 0x80–0x9F in Windows-1252 (Rest = Latin-1). Eigene Tabelle, weil Node ohne
// volles ICU „windows-1252“ als Latin-1 dekodiert (0x80 → U+0080 statt €).
const CP1252_HIGH: Record<number, string> = {
	128: "€",
	130: "‚",
	131: "ƒ",
	132: "„",
	133: "…",
	134: "†",
	135: "‡",
	136: "ˆ",
	137: "‰",
	138: "Š",
	139: "‹",
	140: "Œ",
	142: "Ž",
	145: "‘",
	146: "’",
	147: "“",
	148: "”",
	149: "•",
	150: "–",
	151: "—",
	152: "˜",
	153: "™",
	154: "š",
	155: "›",
	156: "œ",
	158: "ž",
	159: "Ÿ",
};

function decode1252(bytes: Uint8Array): string {
	let out = "";
	for (const b of bytes) out += CP1252_HIGH[b] ?? String.fromCharCode(b);
	return out;
}

function strict(label: string, bytes: Uint8Array): string | null {
	try {
		return new TextDecoder(label, { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

export function decodeText(bytes: Uint8Array): DecodedText | null {
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		if (bytes.byteLength % 2 !== 0) return null;
		const text = strict("utf-16le", bytes.subarray(2));
		return text === null ? null : { text, encoding: "utf-16le" };
	}
	if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		if (bytes.byteLength % 2 !== 0) return null;
		const text = strict("utf-16be", bytes.subarray(2));
		return text === null ? null : { text, encoding: "utf-16be" };
	}
	const utf8 = strict("utf-8", bytes);
	if (utf8 !== null) {
		// Nullbytes in „UTF-8“ sind Binärdaten, kein Text.
		if (utf8.includes("\u0000")) return null;
		return { text: utf8.replace(/^﻿/, ""), encoding: "utf-8" };
	}
	for (const b of bytes) if (NOT_TEXT_1252.has(b)) return null;
	return { text: decode1252(bytes), encoding: "windows-1252" };
}
