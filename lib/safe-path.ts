// Interne Ziele aus Query-Parametern oder Client-Eingaben (Rücksprung nach
// 2FA, Einladung, Benachrichtigungs-Links). Erlaubt nur Pfade dieser App:
// "/x" ja, "//host", "/\host", "https://…", "javascript:…" nein — sonst wird
// aus einem Rücksprung eine offene Weiterleitung.
export function safeInternalPath(
	value: string | null | undefined,
	fallback = "/heute",
): string {
	if (!value) return fallback;
	const v = value.trim();
	if (!/^\/(?![/\\])/.test(v)) return fallback;
	// Steuerzeichen (Tab/Zeilenumbruch) normalisieren Browser weg → "//host".
	// biome-ignore lint/suspicious/noControlCharactersInRegex: genau die sind gemeint
	if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
	return v;
}
