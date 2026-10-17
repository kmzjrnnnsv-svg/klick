import type { AssessmentAnswer, AssessmentQuestion } from "@/db/schema/enums";

// Bewertung eines Fragebogens — rein. Je Frage zählt die wirksame Antwort
// (Bewertung durch ISB/Berater:in vor Selbstauskunft):
//   ja 1 · teilweise 0,5 · nein/weiß nicht/offen 0 · n. a. zählt nicht
//   „ja“ ohne Nachweis, wo einer verlangt ist → 0,5 („nicht belegt“)
// Score = gewichtetes Mittel (Gewicht = gedeckte Anforderungen bzw.
// Fragengewicht) × 100. K.-o.-Fragen (critical) mit 0 → Rating höchstens C.

export type AnswerState = {
	answer: AssessmentAnswer | null;
	reviewerAnswer?: AssessmentAnswer | null;
	// Nachweise an der Antwort + bereits am Control hinterlegte
	evidenceCount: number;
};

export type Verdict =
	| "fulfilled"
	| "unproven"
	| "partial"
	| "not_fulfilled"
	| "open"
	| "not_applicable";

export function effectiveAnswer(a: AnswerState | undefined) {
	return a?.reviewerAnswer ?? a?.answer ?? null;
}

export function questionVerdict(
	q: Pick<AssessmentQuestion, "evidenceRequired">,
	a: AnswerState | undefined,
): Verdict {
	const ans = effectiveAnswer(a);
	if (ans === "na") return "not_applicable";
	if (ans === "yes")
		return q.evidenceRequired && (a?.evidenceCount ?? 0) === 0
			? "unproven"
			: "fulfilled";
	if (ans === "partial") return "partial";
	if (ans === "no") return "not_fulfilled";
	return "open";
}

const VALUE: Record<Verdict, number | null> = {
	fulfilled: 1,
	unproven: 0.5,
	partial: 0.5,
	not_fulfilled: 0,
	open: 0,
	not_applicable: null,
};

export type Rating = "A" | "B" | "C" | "D";

export type AssessmentScore = {
	score: number | null;
	rating: Rating | null;
	progress: { answered: number; total: number };
	counts: Record<Verdict, number>;
	bySection: {
		code: string;
		title: string;
		score: number | null;
		answered: number;
		total: number;
	}[];
	knockouts: string[];
};

// A ≥ 85 ohne K.-o. · B ≥ 70 ohne K.-o. · C ≥ 50 mit höchstens einem K.-o. · sonst D
export function rate(score: number | null, knockouts: number): Rating | null {
	if (score === null) return null;
	if (score >= 85 && knockouts === 0) return "A";
	if (score >= 70 && knockouts === 0) return "B";
	if (score >= 50 && knockouts <= 1) return "C";
	return "D";
}

export function scoreAssessment(
	questions: readonly AssessmentQuestion[],
	answers: ReadonlyMap<string, AnswerState>,
): AssessmentScore {
	const counts: Record<Verdict, number> = {
		fulfilled: 0,
		unproven: 0,
		partial: 0,
		not_fulfilled: 0,
		open: 0,
		not_applicable: 0,
	};
	let wSum = 0;
	let vSum = 0;
	let answered = 0;
	const knockouts: string[] = [];
	const sections = new Map<
		string,
		{ title: string; w: number; v: number; answered: number; total: number }
	>();
	for (const q of questions) {
		const a = answers.get(q.code);
		const verdict = questionVerdict(q, a);
		counts[verdict] += 1;
		if (effectiveAnswer(a) !== null) answered += 1;
		const s = sections.get(q.sectionCode) ?? {
			title: q.sectionTitle,
			w: 0,
			v: 0,
			answered: 0,
			total: 0,
		};
		s.total += 1;
		if (effectiveAnswer(a) !== null) s.answered += 1;
		const value = VALUE[verdict];
		if (value !== null) {
			wSum += q.weight;
			vSum += q.weight * value;
			s.w += q.weight;
			s.v += q.weight * value;
			if (q.critical && value === 0) knockouts.push(q.code);
		}
		sections.set(q.sectionCode, s);
	}
	const score = wSum > 0 ? Math.round((100 * vSum) / wSum) : null;
	return {
		score,
		rating: rate(score, knockouts.length),
		progress: { answered, total: questions.length },
		counts,
		bySection: [...sections].map(([code, s]) => ({
			code,
			title: s.title,
			score: s.w > 0 ? Math.round((100 * s.v) / s.w) : null,
			answered: s.answered,
			total: s.total,
		})),
		knockouts,
	};
}
