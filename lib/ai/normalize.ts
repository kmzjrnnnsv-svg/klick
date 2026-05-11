import type { ExtractedEducation, ExtractedProfile } from "./types";

const NO_DEGREE_PATTERNS: RegExp[] = [
	/\bohne\s+abschluss\b/i,
	/\bkein\s+abschluss\b/i,
	/\babgebrochen\b/i,
	/\bnicht\s+abgeschlossen\b/i,
	/\bno\s+degree\b/i,
	/\bdiscontinued\b/i,
	/\bunfinished\b/i,
	/\bdid\s+not\s+complete\b/i,
];

function looksLikeNoDegree(text: string | undefined): boolean {
	if (!text) return false;
	return NO_DEGREE_PATTERNS.some((re) => re.test(text));
}

// Entfernt Klammer-Zusätze wie "(ohne Abschluss)", die ältere Parser
// in den `degree`-Titel geschrieben haben. Gibt den bereinigten String
// und ein `completed`-Flag zurück.
export function normalizeEducationDegree(degree: string): {
	degree: string;
	completed: boolean;
} {
	const original = degree.trim();
	let cleaned = original;
	let completed = true;
	// (ohne Abschluss), – ohne Abschluss, — ohne Abschluss, etc.
	const stripRe =
		/\s*[—–-]?\s*\(?\s*(ohne\s+abschluss|kein\s+abschluss|abgebrochen|nicht\s+abgeschlossen|no\s+degree|unfinished|discontinued|did\s+not\s+complete)\s*\)?\s*$/i;
	if (stripRe.test(cleaned)) {
		cleaned = cleaned.replace(stripRe, "").trim();
		completed = false;
	} else if (looksLikeNoDegree(cleaned)) {
		completed = false;
	}
	// trailing punctuation left over from stripping ("M.Sc. Informatik –")
	cleaned = cleaned.replace(/[\s—–-]+$/u, "").trim();
	return { degree: cleaned || original, completed };
}

export function normalizeEducationList(
	items: ExtractedEducation[] | undefined,
): ExtractedEducation[] | undefined {
	if (!items) return items;
	return items.map((e) => {
		const { degree, completed } = normalizeEducationDegree(e.degree);
		// Respect an explicit value the model already returned.
		const finalCompleted = e.completed === undefined ? completed : e.completed;
		return { ...e, degree, completed: finalCompleted };
	});
}

// Baut einen Kurzprofil-Text wenn das Modell keinen geliefert hat. Greift
// auf headline + erste Erfahrung zurück; bleibt bewusst kurz und neutral.
export function buildSummaryFallback(p: ExtractedProfile): string | undefined {
	const headline = p.headline?.trim();
	const years = p.yearsExperience;
	const top = p.experience?.[0];
	const skills = (p.skills ?? [])
		.slice(0, 4)
		.map((s) => s.name)
		.filter(Boolean);

	const parts: string[] = [];
	if (headline) {
		parts.push(
			years ? `${headline} mit ${years} Jahren Erfahrung.` : `${headline}.`,
		);
	} else if (top) {
		parts.push(`${top.role} bei ${top.company}.`);
	}
	if (skills.length > 0) {
		parts.push(`Schwerpunkte: ${skills.join(", ")}.`);
	}
	const text = parts.join(" ").trim();
	return text.length > 0 ? text : undefined;
}

export function applyExtractionPostprocessing(
	p: ExtractedProfile,
): ExtractedProfile {
	const education = normalizeEducationList(p.education);
	const summary =
		p.summary && p.summary.trim().length > 0
			? p.summary
			: buildSummaryFallback(p);
	return { ...p, education, summary };
}
