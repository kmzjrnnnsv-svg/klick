import { describe, expect, it } from "vitest";
import type { AssessmentAnswer } from "@/db/schema/enums";
import type { AnswerState } from "@/lib/assessments/score";
import { scoreAssessment } from "@/lib/assessments/score";
import { REQUIREMENT_BY_KEY } from "@/lib/compliance/catalog";
import {
	ART30_BY_CODE,
	ART30_CLAUSES,
} from "@/lib/compliance/catalog/art30-clauses";
import {
	SUPPLIER_TEMPLATE_BY_CODE,
	SUPPLIER_TEMPLATES,
} from "@/lib/compliance/catalog/questionnaires";
import {
	contractClausesFrom,
	dueDiligenceFrom,
	needsFollowUp,
	nextAssessmentDate,
	supplierQuestions,
} from "@/lib/compliance/supplier-assessment";

const ans = (
	answer: AssessmentAnswer | null,
	extra: Partial<AnswerState> = {},
) => ({ answer, evidenceCount: 0, ...extra }) satisfies AnswerState;

describe("Lieferanten-Fragebögen (Form)", () => {
	it.each(
		SUPPLIER_TEMPLATES.map((t) => [t.code, t] as const),
	)("%s: eindeutige Codes, Kapitel, gültige Verweise, K.-o.-Fragen", (_code, t) => {
		const codes = t.questions.map((q) => q.code);
		expect(new Set(codes).size).toBe(codes.length);
		expect(t.questions.length).toBeGreaterThanOrEqual(8);
		expect(t.questions.some((q) => q.critical)).toBe(true);
		for (const q of t.questions) {
			expect(q.sectionCode).toBeTruthy();
			expect(q.sectionTitle).toBeTruthy();
			expect(q.text.endsWith("?")).toBe(true);
			expect(q.weight).toBeGreaterThan(0);
			if (q.mapsTo?.requirement)
				expect(
					REQUIREMENT_BY_KEY.has(q.mapsTo.requirement),
					`${q.code} → ${q.mapsTo.requirement}`,
				).toBe(true);
			for (const c of q.mapsTo?.art30 ?? [])
				expect(ART30_BY_CODE.has(c), `${q.code} → ${c}`).toBe(true);
		}
		expect(SUPPLIER_TEMPLATE_BY_CODE.get(t.code)).toBe(t);
	});

	it("DORA-IKT fragt jede Art.-30-Klausel genau einmal ab", () => {
		const t = SUPPLIER_TEMPLATE_BY_CODE.get("dora-ikt");
		const mapped = (t?.questions ?? []).flatMap((q) => q.mapsTo?.art30 ?? []);
		expect(mapped.sort()).toEqual(ART30_CLAUSES.map((c) => c.code).sort());
	});
});

describe("supplierQuestions", () => {
	const dora = SUPPLIER_TEMPLATE_BY_CODE.get("dora-ikt");
	if (!dora) throw new Error("dora-ikt fehlt");
	const abs3 = ART30_CLAUSES.filter((c) => c.criticalOnly).length;

	it("Abs.-3-Klauseln nur bei kritischen oder wesentlichen Dienstleistern", () => {
		const std = supplierQuestions(dora, {
			criticality: "standard",
			isMaterial: false,
		});
		expect(std.length).toBe(dora.questions.length - abs3);
		expect(
			supplierQuestions(dora, { criticality: "critical", isMaterial: false })
				.length,
		).toBe(dora.questions.length);
		expect(
			supplierQuestions(dora, { criticality: "important", isMaterial: true })
				.length,
		).toBe(dora.questions.length);
	});

	it("andere Fragebögen bleiben vollständig", () => {
		const nis2 = SUPPLIER_TEMPLATE_BY_CODE.get("nis2-sw");
		if (!nis2) throw new Error("nis2-sw fehlt");
		expect(
			supplierQuestions(nis2, { criticality: "standard", isMaterial: false }),
		).toHaveLength(nis2.questions.length);
	});
});

describe("nextAssessmentDate", () => {
	const from = new Date("2026-10-17T10:00:00Z");
	it("kritisch × D → 3 Monate, standard × A → 3 Jahre, ohne Rating wie D", () => {
		expect(nextAssessmentDate("critical", "D", from)).toBe("2027-01-17");
		expect(nextAssessmentDate("standard", "A", from)).toBe("2029-10-17");
		expect(nextAssessmentDate("important", null, from)).toBe("2027-01-17");
		expect(nextAssessmentDate("critical", "A", from)).toBe("2027-10-17");
	});
});

describe("contractClausesFrom", () => {
	const dora = SUPPLIER_TEMPLATE_BY_CODE.get("dora-ikt");
	if (!dora) throw new Error("dora-ikt fehlt");
	const byClause = (code: string) => {
		const q = dora.questions.find((x) => x.mapsTo?.art30?.includes(code));
		if (!q) throw new Error(code);
		return q.code;
	};

	it("ja/nein/teilweise/n. a. → Checkliste; offen lässt den Bestand stehen", () => {
		const answers = new Map<string, AnswerState>([
			[byClause("30(2)(a)"), ans("yes")],
			[byClause("30(2)(b)"), ans("no")],
			[byClause("30(2)(c)"), ans("partial")],
			[byClause("30(2)(d)"), ans("na")],
			[byClause("30(2)(e)"), ans(null)],
			// Bewertung schlägt Selbstauskunft
			[byClause("30(2)(f)"), ans("yes", { reviewerAnswer: "no" })],
		]);
		const out = contractClausesFrom(dora.questions, answers, {
			"30(2)(e)": true,
			"30(2)(b)": true,
		});
		expect(out["30(2)(a)"]).toBe(true);
		expect(out["30(2)(b)"]).toBe(false);
		expect(out["30(2)(c)"]).toBe("teilweise");
		expect(out["30(2)(d)"]).toBe("nicht anwendbar");
		expect(out["30(2)(e)"]).toBe(true);
		expect(out["30(2)(f)"]).toBe(false);
	});
});

describe("Abschluss", () => {
	it("Sorgfaltsprüfung trägt Score, Rating, K.-o. und Entscheidung", () => {
		const nis2 = SUPPLIER_TEMPLATE_BY_CODE.get("nis2-sw");
		if (!nis2) throw new Error("nis2-sw fehlt");
		const critical = nis2.questions.filter((q) => q.critical);
		const answers = new Map<string, AnswerState>(
			nis2.questions.map((q) => [
				q.code,
				ans(q === critical[0] ? "no" : "yes", { evidenceCount: 1 }),
			]),
		);
		const s = scoreAssessment(nis2.questions, answers);
		expect(s.knockouts).toEqual([critical[0]?.code]);
		expect(s.rating).toBe("C");
		const dd = dueDiligenceFrom({
			assessmentId: "a1",
			code: "LB-2026-01",
			template: "nis2-sw",
			score: s.score,
			rating: s.rating,
			knockouts: s.knockouts,
			decision: "accept_with_conditions",
			decisionNote: "Notfallplan bis Q1 nachreichen",
			completedAt: new Date("2026-10-17T10:00:00Z"),
		});
		expect(dd).toMatchObject({
			method: "questionnaire",
			assessmentCode: "LB-2026-01",
			rating: "C",
			knockouts: critical[0]?.code,
			decision: "accept_with_conditions",
			assessedAt: "2026-10-17",
		});
	});

	it("Folgeaufgabe bei Auflagen, Ablehnung oder schwachem Rating", () => {
		expect(needsFollowUp("A", "accept")).toBe(false);
		expect(needsFollowUp("B", "accept")).toBe(false);
		expect(needsFollowUp("C", "accept")).toBe(true);
		expect(needsFollowUp(null, "accept")).toBe(false);
		expect(needsFollowUp("A", "accept_with_conditions")).toBe(true);
		expect(needsFollowUp("A", "reject")).toBe(true);
	});
});
