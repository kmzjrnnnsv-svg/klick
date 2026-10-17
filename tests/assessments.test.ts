import { describe, expect, it } from "vitest";
import type { AssessmentQuestion } from "@/db/schema/enums";
import { applyChanges, proposeControlStatus } from "@/lib/assessments/apply";
import {
	catalogQuestions,
	sectionsOf,
} from "@/lib/assessments/catalog-template";
import { proposeMeasures } from "@/lib/assessments/measures";
import {
	type AnswerState,
	questionVerdict,
	rate,
	scoreAssessment,
} from "@/lib/assessments/score";
import { answerStates, nextAssessmentCode } from "@/lib/assessments/state";
import { synergyCatalogFor } from "@/lib/compliance/catalog-view";
import { prioritizePlan } from "@/lib/compliance/synergy";

const profile = {
	sector: "other" as const,
	licenceStage: "0_vorbereitung" as const,
	caspServices: [],
};

describe("catalogQuestions", () => {
	it("eine Frage je Control, gemeinsame Controls nur einmal", () => {
		const iso = catalogQuestions({ ...profile, frameworks: ["iso27001"] });
		const nis2 = catalogQuestions({ ...profile, frameworks: ["nis2"] });
		const both = catalogQuestions({
			...profile,
			frameworks: ["iso27001", "nis2"],
		});
		const codes = new Set(both.map((q) => q.code));
		expect(codes.size).toBe(both.length);
		expect(both.length).toBeLessThan(iso.length + nis2.length);
		// ein gemeinsames Control deckt Anforderungen aus beiden Rahmenwerken
		expect(both.some((q) => (q.frameworks ?? []).length === 2)).toBe(true);
		// Gewicht = gedeckte Anforderungen
		for (const q of both) expect(q.weight).toBe(q.requirements?.length);
	});

	it("Kapitel nach Domäne, geordnet; nur ausgewählte Controls bei Delta", () => {
		const qs = catalogQuestions({ ...profile, frameworks: ["iso27001"] });
		const sections = sectionsOf(qs);
		expect(sections[0]?.code).toBe("governance");
		expect(sections.reduce((n, s) => n + s.count, 0)).toBe(qs.length);
		const only = catalogQuestions({
			...profile,
			frameworks: ["iso27001"],
			onlyControls: new Set(["CC-GOV-01"]),
		});
		expect(only.map((q) => q.code)).toEqual(["CC-GOV-01"]);
	});

	it("künftig geltende Anforderungen (AMLR) sind schon heute im Fragebogen", () => {
		const qs = catalogQuestions({ ...profile, frameworks: ["amlr"] });
		expect(qs.length).toBeGreaterThan(0);
	});
});

const q = (
	code: string,
	over: Partial<AssessmentQuestion> = {},
): AssessmentQuestion => ({
	code,
	controlCode: code,
	sectionCode: "governance",
	sectionTitle: "Governance",
	text: code,
	weight: 1,
	evidenceRequired: true,
	...over,
});
const st = (
	answer: AnswerState["answer"],
	evidenceCount = 1,
	reviewerAnswer: AnswerState["answer"] = null,
): AnswerState => ({ answer, evidenceCount, reviewerAnswer });

describe("scoreAssessment", () => {
	it("Ja ohne Nachweis = nicht belegt (halb), n. a. zählt nicht", () => {
		expect(questionVerdict(q("A"), st("yes", 0))).toBe("unproven");
		expect(questionVerdict(q("A"), st("yes", 1))).toBe("fulfilled");
		expect(
			questionVerdict(q("A", { evidenceRequired: false }), st("yes", 0)),
		).toBe("fulfilled");
		const s = scoreAssessment(
			[q("A", { weight: 2 }), q("B"), q("C"), q("D")],
			new Map([
				["A", st("yes", 1)],
				["B", st("yes", 0)],
				["C", st("na")],
				["D", st(null)],
			]),
		);
		// (2·1 + 1·0,5 + 1·0) / 4
		expect(s.score).toBe(63);
		expect(s.progress).toEqual({ answered: 3, total: 4 });
		expect(s.counts.unproven).toBe(1);
		expect(s.counts.open).toBe(1);
	});

	it("Bewertung durch Prüfer:in schlägt Selbstauskunft", () => {
		const s = scoreAssessment([q("A")], new Map([["A", st("yes", 1, "no")]]));
		expect(s.score).toBe(0);
	});

	it("Rating mit K.-o.-Fragen", () => {
		expect(rate(90, 0)).toBe("A");
		expect(rate(75, 0)).toBe("B");
		expect(rate(90, 1)).toBe("C");
		expect(rate(60, 2)).toBe("D");
		expect(rate(40, 0)).toBe("D");
		expect(rate(null, 0)).toBeNull();
	});
});

describe("proposeControlStatus", () => {
	it("übersetzt Antworten in Status-Diffs, offene Fragen ändern nichts", () => {
		const changes = proposeControlStatus(
			[q("A"), q("B"), q("C"), q("D"), q("E")],
			new Map([
				["A", { ...st("yes"), naReason: null }],
				["B", { ...st("partial"), naReason: null }],
				["C", { ...st("na"), naReason: "Kein Rechenzentrum" }],
				["D", { ...st("unknown"), naReason: null }],
				["E", { ...st("no"), naReason: null }],
			]),
			new Map([
				["A", "not_started"],
				["B", "in_progress"],
				["E", "planned"],
			]),
		);
		expect(changes).toEqual([
			{
				controlCode: "A",
				from: "not_started",
				to: "implemented",
				naReason: undefined,
			},
			{
				controlCode: "C",
				from: "not_started",
				to: "not_applicable",
				naReason: "Kein Rechenzentrum",
			},
		]);
		expect(applyChanges(new Map(), changes).get("A")).toBe("implemented");
	});
});

describe("proposeMeasures", () => {
	it("umsetzen in Plan-Reihenfolge, offene Fragen klären, Ja ohne Beleg belegen", () => {
		const qs = catalogQuestions({ ...profile, frameworks: ["nis2"] });
		const [first, second, third] = qs;
		if (!first || !second || !third) throw new Error("zu wenige Fragen");
		const answers = answerStates(qs, [
			{
				questionCode: first.code,
				answer: "unknown",
				reviewerAnswer: null,
				naReason: null,
				evidenceIds: [],
			},
			{
				questionCode: second.code,
				answer: "yes",
				reviewerAnswer: null,
				naReason: null,
				evidenceIds: [],
			},
			{
				questionCode: third.code,
				answer: "yes",
				reviewerAnswer: null,
				naReason: null,
				evidenceIds: ["e1"],
			},
		]);
		const impl = new Map(
			[second, third].map((x) => [x.code, "implemented" as const]),
		);
		const plan = prioritizePlan(
			["nis2"],
			synergyCatalogFor({ ...profile, frameworks: ["nis2"] }),
			impl,
			300,
		);
		const m = proposeMeasures({ questions: qs, answers, plan });
		expect(m.find((x) => x.controlCode === first.code)?.kind).toBe("clarify");
		expect(m.find((x) => x.controlCode === second.code)?.kind).toBe("evidence");
		expect(m.some((x) => x.controlCode === third.code)).toBe(false);
		// unbeantwortete Fragen sind „klären“, tragen aber die Plan-Kurve
		const firstPlanned = m.find((x) => x.coverageAfter !== undefined);
		expect(firstPlanned?.coverageAfter).toBeGreaterThan(0);
		// Plan-Reihenfolge: Abdeckung danach steigt monoton
		const curve = m
			.filter((x) => x.coverageAfter !== undefined)
			.map((x) => x.coverageAfter ?? 0);
		expect([...curve].sort((a, b) => a - b)).toEqual(curve);
	});
});

describe("nextAssessmentCode", () => {
	it("zählt je Jahr und Präfix hoch", () => {
		const now = new Date("2026-10-17");
		expect(nextAssessmentCode([], "GA", now)).toBe("GA-2026-01");
		expect(
			nextAssessmentCode(
				["GA-2026-01", "GA-2026-07", "GA-2025-09", "LB-2026-03"],
				"GA",
				now,
			),
		).toBe("GA-2026-08");
	});
});
