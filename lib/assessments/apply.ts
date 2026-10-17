import type { AssessmentQuestion, ImplStatus } from "@/db/schema/enums";
import { type AnswerState, effectiveAnswer } from "./score";

// Antworten der Gap-Analyse → Control-Status (Vorschlag mit Diff). Wird erst
// mit „Ergebnis übernehmen“ geschrieben, nie beim Beantworten.
//   ja → implemented · teilweise → in_progress · nein → not_started
//   (geplant bleibt geplant) · n. a. → not_applicable · weiß nicht/offen → —

export type StatusChange = {
	controlCode: string;
	from: ImplStatus;
	to: ImplStatus;
	naReason?: string | null;
};

export function proposeControlStatus(
	questions: readonly AssessmentQuestion[],
	answers: ReadonlyMap<string, AnswerState & { naReason?: string | null }>,
	current: ReadonlyMap<string, ImplStatus>,
): StatusChange[] {
	const out: StatusChange[] = [];
	for (const q of questions) {
		if (!q.controlCode) continue;
		const a = answers.get(q.code);
		const ans = effectiveAnswer(a);
		const from = current.get(q.controlCode) ?? "not_started";
		let to: ImplStatus | null = null;
		if (ans === "yes") to = "implemented";
		else if (ans === "partial") to = "in_progress";
		else if (ans === "no") to = from === "planned" ? "planned" : "not_started";
		else if (ans === "na") to = "not_applicable";
		if (to && to !== from)
			out.push({
				controlCode: q.controlCode,
				from,
				to,
				naReason: ans === "na" ? (a?.naReason ?? null) : undefined,
			});
	}
	return out;
}

export function applyChanges(
	current: ReadonlyMap<string, ImplStatus>,
	changes: readonly StatusChange[],
): Map<string, ImplStatus> {
	const out = new Map(current);
	for (const c of changes) out.set(c.controlCode, c.to);
	return out;
}
