// Content-Disposition für Downloads (RFC 6266): `filename` nur ASCII als
// Rückfall, der echte Name UTF-8-kodiert in `filename*`. Header-Werte dürfen
// keine Zeichen über U+00FF enthalten — sonst wirft `Headers` (Download 500).
const UMLAUTS: Record<string, string> = {
	ä: "ae",
	ö: "oe",
	ü: "ue",
	Ä: "Ae",
	Ö: "Oe",
	Ü: "Ue",
	ß: "ss",
};

export function asciiFileName(name: string): string {
	const ascii = name
		.replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c] ?? "_")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\x20-\x7e]/g, "_")
		.replace(/["\\]/g, "_")
		.trim();
	return ascii || "download";
}

export function contentDisposition(fileName: string): string {
	const clean = fileName.replace(/[\r\n"]/g, "").trim() || "download";
	return `attachment; filename="${asciiFileName(clean)}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
