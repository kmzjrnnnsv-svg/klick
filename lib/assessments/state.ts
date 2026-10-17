import type { AssessmentAnswer, AssessmentQuestion } from "@/db/schema/enums";
import type { AnswerState } from "./score";

// Antwortzeilen + bereits am Control hängende Nachweise → AnswerState je
// Frage (Eingang für Score, Status-Vorschlag, Maßnahmen). Rein.

export type AnswerRowLike = {
	questionCode: string;
	answer: AssessmentAnswer | null;
	reviewerAnswer: AssessmentAnswer | null;
	naReason: string | null;
	evidenceIds: readonly string[];
};

export function answerStates(
	questions: readonly AssessmentQuestion[],
	rows: readonly AnswerRowLike[],
	controlEvidence: ReadonlyMap<string, readonly unknown[]> = new Map(),
): Map<string, AnswerState & { naReason: string | null }> {
	const byCode = new Map(rows.map((r) => [r.questionCode, r]));
	const out = new Map<string, AnswerState & { naReason: string | null }>();
	for (const q of questions) {
		const r = byCode.get(q.code);
		const linked = q.controlCode
			? (controlEvidence.get(q.controlCode)?.length ?? 0)
			: 0;
		out.set(q.code, {
			answer: r?.answer ?? null,
			reviewerAnswer: r?.reviewerAnswer ?? null,
			naReason: r?.naReason ?? null,
			evidenceCount: (r?.evidenceIds.length ?? 0) + linked,
		});
	}
	return out;
}

// GA-2026-01, GA-2026-02 … (Gap-Analyse) bzw. LB-… (Lieferantenbewertung).
export function nextAssessmentCode(
	existing: readonly string[],
	prefix: string,
	now: Date,
): string {
	const year = now.getUTCFullYear();
	const head = `${prefix}-${year}-`;
	let max = 0;
	for (const c of existing)
		if (c.startsWith(head))
			max = Math.max(max, Number(c.slice(head.length)) || 0);
	return `${head}${String(max + 1).padStart(2, "0")}`;
}
