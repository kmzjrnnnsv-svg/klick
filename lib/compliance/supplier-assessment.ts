import type { AssessmentQuestion, CRITICALITY } from "@/db/schema/enums";
import type { ContractClauses, DueDiligence } from "@/db/schema/registers";
import {
	type AnswerState,
	effectiveAnswer,
	type Rating,
} from "@/lib/assessments/score";
import { ART30_BY_CODE } from "./catalog/art30-clauses";
import type { SupplierTemplate } from "./catalog/questionnaires";

// Lieferantenbewertung (S6) — rein: Wiedervorlage nach Kritikalität ×
// Rating, Eintrag der Sorgfaltsprüfung am Dienstleister, Klausel-Checkliste
// aus den Art.-30-Antworten, Folgemaßnahmen.

type Criticality = (typeof CRITICALITY)[number];
export type SupplierDecision = "accept" | "accept_with_conditions" | "reject";

// Monate bis zur nächsten Bewertung: kritische Dienstleister und schwache
// Ratings häufiger.
export const REVIEW_MONTHS: Record<Criticality, Record<Rating, number>> = {
	critical: { A: 12, B: 12, C: 6, D: 3 },
	important: { A: 24, B: 12, C: 6, D: 3 },
	standard: { A: 36, B: 24, C: 12, D: 6 },
};

export function nextAssessmentDate(
	criticality: Criticality,
	rating: Rating | null,
	from: Date,
): string {
	const months = REVIEW_MONTHS[criticality][rating ?? "D"];
	const d = new Date(from);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
}

// Fragen für einen Dienstleister: Art.-30-Abs.-3-Klauseln nur bei kritischen
// oder wichtigen Funktionen (Kritikalität „critical“ oder wesentlich).
export function supplierQuestions(
	template: Pick<SupplierTemplate, "questions">,
	provider: { criticality: Criticality; isMaterial: boolean },
): AssessmentQuestion[] {
	if (provider.criticality === "critical" || provider.isMaterial)
		return [...template.questions];
	return template.questions.filter(
		(q) =>
			!(q.mapsTo?.art30 ?? []).some((c) => ART30_BY_CODE.get(c)?.criticalOnly),
	);
}

export function dueDiligenceFrom(input: {
	assessmentId: string;
	code: string;
	template: string;
	score: number | null;
	rating: Rating | null;
	knockouts: readonly string[];
	decision: SupplierDecision;
	decisionNote: string | null;
	completedAt: Date;
}): DueDiligence {
	return {
		method: "questionnaire",
		template: input.template,
		assessmentId: input.assessmentId,
		assessmentCode: input.code,
		score: input.score === null ? null : String(input.score),
		rating: input.rating,
		knockouts: input.knockouts.length > 0 ? input.knockouts.join(", ") : null,
		decision: input.decision,
		decisionNote: input.decisionNote,
		assessedAt: input.completedAt.toISOString().slice(0, 10),
	};
}

// Art.-30-Klauseln aus den Antworten: ja → erfüllt, teilweise → Notiz,
// nein → fehlt; offene Antworten lassen den bisherigen Stand stehen.
export function contractClausesFrom(
	questions: readonly AssessmentQuestion[],
	answers: ReadonlyMap<string, AnswerState>,
	existing: ContractClauses | null,
): ContractClauses {
	const out: ContractClauses = { ...(existing ?? {}) };
	for (const q of questions) {
		const codes = q.mapsTo?.art30;
		if (!codes?.length) continue;
		const a = effectiveAnswer(answers.get(q.code));
		const value =
			a === "yes"
				? true
				: a === "no"
					? false
					: a === "partial"
						? "teilweise"
						: a === "na"
							? "nicht anwendbar"
							: undefined;
		if (value === undefined) continue;
		for (const c of codes) out[c] = value;
	}
	return out;
}

export function needsFollowUp(
	rating: Rating | null,
	decision: SupplierDecision,
): boolean {
	return decision !== "accept" || rating === "C" || rating === "D";
}
