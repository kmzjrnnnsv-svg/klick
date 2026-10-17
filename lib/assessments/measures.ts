import type { AssessmentQuestion } from "@/db/schema/enums";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import type { PrioritizedPlan } from "@/lib/compliance/synergy";
import { type AnswerState, questionVerdict } from "./score";

// Maßnahmenplan aus der Gap-Analyse: zuerst umsetzen (Reihenfolge aus
// prioritizePlan — Hebel je Aufwand, kumulierte Abdeckung), dann klären
// (weiß nicht/offen), dann belegen (umgesetzt, aber ohne Nachweis). Je
// Maßnahme Empfehlung und Vorlagen aus dem Katalog.

export type MeasureKind = "implement" | "clarify" | "evidence";

export type Measure = {
	kind: MeasureKind;
	controlCode: string;
	title: string;
	effort: "S" | "M" | "L";
	requirements: number;
	frameworks: string[];
	// nur „implement“: Abdeckung danach (kumuliert, alle Rahmenwerke)
	coverageAfter?: number;
	recommendation?: string;
	templates: string[];
	evidenceHints: string[];
};

export function proposeMeasures(input: {
	questions: readonly AssessmentQuestion[];
	answers: ReadonlyMap<string, AnswerState>;
	plan: PrioritizedPlan;
}): Measure[] {
	const byControl = new Map(
		input.questions
			.filter((q) => q.controlCode)
			.map((q) => [q.controlCode as string, q]),
	);
	const meta = (code: string) => {
		const c = CONTROL_BY_CODE.get(code);
		const q = byControl.get(code);
		return {
			title: c?.title ?? code,
			effort: c?.effort ?? ("M" as const),
			requirements: q?.requirements?.length ?? 0,
			frameworks: q?.frameworks ?? [],
			recommendation:
				c?.recommendations?.find((r) => r.level === "must")?.text ??
				c?.recommendations?.[0]?.text,
			templates: c?.templates ?? [],
			evidenceHints: c?.evidenceHints ?? [],
		};
	};
	const out: Measure[] = [];
	const seen = new Set<string>();
	// Plan-Reihenfolge; offene Fragen (weiß nicht) erst klären, dann umsetzen.
	for (const step of input.plan.steps) {
		const q = byControl.get(step.control);
		if (!q) continue;
		seen.add(step.control);
		const open = questionVerdict(q, input.answers.get(q.code)) === "open";
		out.push({
			kind: open ? "clarify" : "implement",
			controlCode: step.control,
			...meta(step.control),
			coverageAfter: step.cumulativeCoveragePct,
		});
	}
	// Ohne Abdeckungsgewinn (andere Controls decken die Anforderungen schon):
	// trotzdem auflisten — klären, umsetzen, belegen.
	const rest = [...byControl.values()].filter(
		(q) => !seen.has(q.controlCode as string),
	);
	const verdictOf = (q: AssessmentQuestion) =>
		questionVerdict(q, input.answers.get(q.code));
	const push = (q: AssessmentQuestion, kind: MeasureKind) =>
		out.push({
			kind,
			controlCode: q.controlCode as string,
			...meta(q.controlCode as string),
		});
	for (const q of rest) if (verdictOf(q) === "open") push(q, "clarify");
	for (const q of rest) {
		const v = verdictOf(q);
		if (v === "not_fulfilled" || v === "partial") push(q, "implement");
	}
	for (const q of rest) if (verdictOf(q) === "unproven") push(q, "evidence");
	return out;
}
