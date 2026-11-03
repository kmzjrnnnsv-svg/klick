import type { AssessmentQuestion } from "@/db/schema/enums";

// Kurz-Check der Gap-Analyse (pure, Test `short-check`): statt jeder Frage
// zuerst die wichtigsten — die Maßnahmen, die die meisten Anforderungen über
// alle gewählten Rahmenwerke tragen. Später lässt sich der Fragebogen auf
// alle Fragen erweitern; beantwortete Fragen bleiben, wie sie sind.

export const SHORT_CHECK_SIZE = 30;

export type AssessmentScope = "short" | "all";

/**
 * Die `size` wichtigsten Fragen: nach Gewicht (Zahl der Anforderungen),
 * dann nach Zahl der Rahmenwerke, dann nach Code. Die Reihenfolge des
 * Fragebogens (Kapitel) bleibt erhalten.
 */
export function shortCheck(
	questions: readonly AssessmentQuestion[],
	size = SHORT_CHECK_SIZE,
): AssessmentQuestion[] {
	if (questions.length <= size) return [...questions];
	const ranked = [...questions].sort(
		(a, b) =>
			b.weight - a.weight ||
			(b.frameworks?.length ?? 0) - (a.frameworks?.length ?? 0) ||
			a.code.localeCompare(b.code),
	);
	const keep = new Set(ranked.slice(0, size).map((q) => q.code));
	return questions.filter((q) => keep.has(q.code));
}

/**
 * Fragebogen auf alle Fragen erweitern: Reihenfolge wie der vollständige
 * Fragebogen, vorhandene Fragen bleiben unverändert (Schnappschuss), Fragen,
 * die es im vollständigen nicht mehr gibt, bleiben am Ende stehen.
 */
export function extendQuestions(
	current: readonly AssessmentQuestion[],
	all: readonly AssessmentQuestion[],
): { questions: AssessmentQuestion[]; added: number } {
	const byCode = new Map(current.map((q) => [q.code, q]));
	const allCodes = new Set(all.map((q) => q.code));
	let added = 0;
	const merged = all.map((q) => {
		const existing = byCode.get(q.code);
		if (existing) return existing;
		added += 1;
		return q;
	});
	for (const q of current) if (!allCodes.has(q.code)) merged.push(q);
	return { questions: merged, added };
}

/** Wie viele Fragen eine Erweiterung hinzufügen würde */
export function missingQuestions(
	current: readonly AssessmentQuestion[],
	all: readonly AssessmentQuestion[],
): number {
	const have = new Set(current.map((q) => q.code));
	return all.filter((q) => !have.has(q.code)).length;
}
