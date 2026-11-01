import type { AssessmentQuestion, ImplStatus } from "@/db/schema/enums";
import { type AnswerState, effectiveAnswer } from "./score";

// Antworten der Gap-Analyse → Control-Status (Vorschlag mit Diff). Wird erst
// mit „Ergebnis übernehmen“ geschrieben, nie beim Beantworten.
//   ja → implemented · teilweise → in_progress · nein → not_started
//   (geplant bleibt geplant) · weiß nicht/offen → —
//   n. a. → Ausschluss je Anforderung, wo das Rahmenwerk ihn kennt
//   (proposeExclusions); not_applicable nur, wenn danach keine Anforderung
//   der Frage offen bliebe (ausgeschlossen oder von der Maßnahme nur
//   teilweise getragen, opts.dropsControl), sonst bleibt der Status.
//   „Nicht relevant“ wirkt nur bestätigt (opts.naConfirmed: Freigabe durch
//   eine zweite Person, Auslöser assessment.not_relevant)

export type StatusChange = {
	controlCode: string;
	from: ImplStatus;
	to: ImplStatus;
	naReason?: string | null;
};

export type NaOptions = {
	// entfällt das Control bei „nicht relevant“? Standard: alle ausschließbar
	dropsControl?: (q: AssessmentQuestion) => boolean;
	// ist „nicht relevant“ bestätigt? Standard: ja (Fragebögen ohne Freigabe)
	naConfirmed?: (q: AssessmentQuestion) => boolean;
};

export function proposeControlStatus(
	questions: readonly AssessmentQuestion[],
	answers: ReadonlyMap<string, AnswerState & { naReason?: string | null }>,
	current: ReadonlyMap<string, ImplStatus>,
	excludable: (key: string) => boolean = () => true,
	opts: NaOptions = {},
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
		else if (ans === "na" && (opts.naConfirmed?.(q) ?? true))
			to = (
				opts.dropsControl
					? opts.dropsControl(q)
					: (q.requirements ?? []).every(excludable)
			)
				? "not_applicable"
				: null;
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

export type ExclusionChange = {
	key: string;
	controlCode: string;
	note: string;
};

// „Nicht relevant“ → Ausschluss der ausschließbaren Anforderungen der Frage
// (Begründung = naReason); schon manuell ausgeschlossene bleiben unberührt
export function proposeExclusions(
	questions: readonly AssessmentQuestion[],
	answers: ReadonlyMap<string, AnswerState & { naReason?: string | null }>,
	excludable: (key: string) => boolean,
	alreadyExcluded: ReadonlySet<string> = new Set(),
	naConfirmed: (q: AssessmentQuestion) => boolean = () => true,
): ExclusionChange[] {
	const out: ExclusionChange[] = [];
	const seen = new Set<string>();
	for (const q of questions) {
		if (!q.controlCode) continue;
		const a = answers.get(q.code);
		if (effectiveAnswer(a) !== "na" || !naConfirmed(q)) continue;
		const note = a?.naReason?.trim() || "Nicht relevant (Gap-Analyse)";
		for (const key of q.requirements ?? []) {
			if (!excludable(key) || alreadyExcluded.has(key) || seen.has(key))
				continue;
			seen.add(key);
			out.push({ key, controlCode: q.controlCode, note });
		}
	}
	return out;
}
