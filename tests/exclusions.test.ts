import { describe, expect, it } from "vitest";
import type { AssessmentQuestion } from "@/db/schema/enums";
import {
	proposeControlStatus,
	proposeExclusions,
} from "@/lib/assessments/apply";
import { naAllowed, naOpenShare } from "@/lib/assessments/na";
import { type AnswerState, scoreAssessment } from "@/lib/assessments/score";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	exclusionAllowedForKey,
	exclusionRule,
	naImpact,
} from "@/lib/compliance/exclusions";
import { invalidExclusionBlockers } from "@/lib/compliance/queries-readiness";

// Ausschluss je Rahmenwerk: nur ISO 27001 Anhang A und die wählbaren
// SOC-2-Kategorien; DORA, NIS2, GwG … kennen keinen Ausschluss.

function codes(slug: string): string[] {
	return (FRAMEWORK_BY_SLUG.get(slug)?.requirements ?? []).map((r) => r.code);
}
const isoAnnex = codes("iso27001").find((c) => c.startsWith("A.")) ?? "";
const isoClause = codes("iso27001").find((c) => !c.startsWith("A.")) ?? "";
const dora = codes("dora")[0] ?? "";
const soc2 = FRAMEWORK_BY_SLUG.get("soc2")?.requirements ?? [];
const soc2Cc = soc2.find((r) => r.sectionCode.startsWith("CC"))?.code ?? "";
const soc2A = soc2.find((r) => r.sectionCode === "A1")?.code ?? "";

const st = (
	answer: AnswerState["answer"],
	naReason: string | null = null,
): AnswerState & { naReason: string | null } => ({
	answer,
	evidenceCount: 0,
	naReason,
});

function q(code: string, requirements: string[]): AssessmentQuestion {
	return {
		code,
		sectionCode: "S",
		sectionTitle: "S",
		text: code,
		controlCode: `CC-TST-${code}`,
		requirements,
		frameworks: [...new Set(requirements.map((k) => k.split(":")[0] ?? ""))],
		weight: requirements.length,
	};
}

describe("exclusionRule", () => {
	it("ISO 27001: nur Anhang A, nie die Klauseln 4–10", () => {
		expect(isoAnnex && isoClause).toBeTruthy();
		expect(exclusionRule("iso27001", isoAnnex).allowed).toBe(true);
		expect(exclusionRule("iso27001", isoClause).allowed).toBe(false);
	});

	it("DORA kennt keinen Ausschluss", () => {
		expect(exclusionRule("dora", dora).allowed).toBe(false);
	});

	it("SOC 2: Security nie, Zusatzkategorien ja", () => {
		expect(exclusionRule("soc2", soc2Cc).allowed).toBe(false);
		expect(exclusionRule("soc2", soc2A).allowed).toBe(true);
	});

	it("unbekannte Anforderung oder Rahmenwerk: kein Ausschluss", () => {
		expect(exclusionRule("iso27001", "A.99.99").allowed).toBe(false);
		expect(exclusionAllowedForKey("gibtsnicht:1")).toBe(false);
		expect(exclusionAllowedForKey("ohne-doppelpunkt")).toBe(false);
	});

	it("naImpact trennt ausschließbare und offene Anforderungen", () => {
		const r = naImpact([`iso27001:${isoAnnex}`, `dora:${dora}`]);
		expect(r.excludable.map((x) => x.key)).toEqual([`iso27001:${isoAnnex}`]);
		expect(r.excludable[0]?.label).toContain("ISO 27001");
		expect(r.blocked.map((x) => x.key)).toEqual([`dora:${dora}`]);
	});
});

describe("„Nicht relevant“ in der Gap-Analyse", () => {
	const onlyIso = q("A", [`iso27001:${isoAnnex}`]);
	const mixed = q("B", [`iso27001:${isoAnnex}`, `dora:${dora}`]);
	const onlyDora = q("C", [`dora:${dora}`]);

	it("Control entfällt nur, wenn alle Anforderungen ausschließbar sind", () => {
		const changes = proposeControlStatus(
			[onlyIso, mixed],
			new Map([
				["A", st("na", "Kein eigenes Rechenzentrum")],
				["B", st("na", "Kein eigenes Rechenzentrum")],
			]),
			new Map(),
			exclusionAllowedForKey,
		);
		expect(changes).toEqual([
			{
				controlCode: "CC-TST-A",
				from: "not_started",
				to: "not_applicable",
				naReason: "Kein eigenes Rechenzentrum",
			},
		]);
	});

	it("Ausschlüsse nur für ausschließbare Anforderungen, ohne Doppelte", () => {
		const out = proposeExclusions(
			[onlyIso, mixed],
			new Map([
				["A", st("na", "Grund A")],
				["B", st("na", " ")],
			]),
			exclusionAllowedForKey,
		);
		expect(out).toEqual([
			{
				key: `iso27001:${isoAnnex}`,
				controlCode: "CC-TST-A",
				note: "Grund A",
			},
		]);
	});

	it("schon ausgeschlossene bleiben unberührt, leere Begründung bekommt einen Text", () => {
		const out = proposeExclusions(
			[mixed],
			new Map([["B", st("na", "  ")]]),
			exclusionAllowedForKey,
		);
		expect(out[0]?.note).toBe("Nicht relevant (Gap-Analyse)");
		expect(
			proposeExclusions(
				[mixed],
				new Map([["B", st("na", "x")]]),
				exclusionAllowedForKey,
				new Set([`iso27001:${isoAnnex}`]),
			),
		).toEqual([]);
	});

	it("„Nicht relevant“ erlaubt, wenn mindestens eine Anforderung ausschließbar ist", () => {
		expect(naAllowed(onlyIso)).toBe(true);
		expect(naAllowed(mixed)).toBe(true);
		expect(naAllowed(onlyDora)).toBe(false);
		// Fragebogen ohne Katalogbezug (Lieferant, Produkt) wie bisher
		expect(naAllowed({ ...onlyDora, controlCode: undefined })).toBe(true);
	});

	it("Bewertung: der nicht ausschließbare Teil zählt als offen", () => {
		expect(naOpenShare(mixed)).toBe(0.5);
		const answers = new Map([
			["A", st("yes")],
			["B", st("na", "x")],
		]);
		const plain = scoreAssessment([onlyIso, mixed], answers);
		const strict = scoreAssessment([onlyIso, mixed], answers, {
			naOpenShare,
		});
		expect(plain.score).toBe(100);
		// A: Gewicht 1 erfüllt; B: Gewicht 2, davon die Hälfte offen
		expect(strict.score).toBe(50);
	});
});

describe("Prüfungsreife: Ausschluss ohne Grundlage", () => {
	it("nur manuelle Ausschlüsse in Rahmenwerken ohne Ausschluss werden Blocker", () => {
		const detail = new Map([
			[`dora:${dora}`, { applicable: false, source: "manual", note: "alt" }],
			[
				`iso27001:${isoAnnex}`,
				{ applicable: false, source: "manual", note: "SoA" },
			],
			[
				`iso27001:${isoClause}`,
				{ applicable: false, source: "rule", note: null },
			],
		]);
		const out = invalidExclusionBlockers(detail, ["dora", "iso27001"]);
		expect([...out.keys()]).toEqual(["dora"]);
		const b = out.get("dora")?.[0];
		expect(b?.kind).toBe("exclusion_invalid");
		expect(b?.href).toBe(`/rahmenwerke/dora/${encodeURIComponent(dora)}`);
		// nicht gewähltes Rahmenwerk zählt nicht
		expect(invalidExclusionBlockers(detail, ["iso27001"]).size).toBe(0);
	});
});
