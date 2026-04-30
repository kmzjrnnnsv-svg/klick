// Filename- and mime-based kind detection. Fast, runs synchronously during
// upload so we can persist a sensible kind immediately and let the AI
// confirm/correct it later in the background extractor.
//
// Returns "other" when no pattern matches — never throws.

export type DetectedKind = "cv" | "certificate" | "badge" | "id_doc" | "other";

const PATTERNS: Array<{ kind: DetectedKind; rx: RegExp }> = [
	// CV / Lebenslauf / résumé
	{ kind: "cv", rx: /\b(cv|curriculum.?vitae|lebenslauf|resume|résumé)\b/i },
	// Identity documents
	{
		kind: "id_doc",
		rx: /\b(perso(nalausweis)?|ausweis|reisepass|passport|id.?card|drivers?[-_ ]?license|f(ü|u)hrerschein)\b/i,
	},
	// Open Badges (file form). URL-form has its own action.
	{ kind: "badge", rx: /\b(open.?badge|badge|credly|obi)\b/i },
	// Certificates / Zeugnisse / Zertifikate
	{
		kind: "certificate",
		rx: /\b(zeugnis|zertifikat|certificate|cert|diploma|diplom|abschluss|attest|bescheinigung)\b/i,
	},
];

export function detectKindFromFilename(
	filename: string,
	mime?: string,
): DetectedKind {
	for (const { kind, rx } of PATTERNS) {
		if (rx.test(filename)) return kind;
	}
	// JSON-LD upload that wasn't named after Credly is still likely a badge file.
	if (mime?.includes("ld+json") || mime?.includes("application/json")) {
		return "badge";
	}
	return "other";
}
