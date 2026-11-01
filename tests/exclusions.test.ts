import { describe, expect, it } from "vitest";
import type { AssessmentQuestion } from "@/db/schema/enums";
import {
	proposeControlStatus,
	proposeExclusions,
} from "@/lib/assessments/apply";
import {
	naAllowed,
	naDropsControl,
	naImpactOf,
	naOpenShare,
} from "@/lib/assessments/na";
import { type AnswerState, scoreAssessment } from "@/lib/assessments/score";
import {
	EDGES_BY_CONTROL,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import {
	exclusionAllowedForKey,
	exclusionRule,
	naChoosable,
	naImpact,
} from "@/lib/compliance/exclusions";
import { STATIC_CATALOG } from "@/lib/compliance/org-catalog";
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

describe("„Nicht relevant“: nur teilweise getragene Anforderungen", () => {
	// CC-OPS-08 trägt ISO 27001 8.1 nur teilweise (andere Maßnahmen tragen
	// den Rest) und A.5.37 ganz (Anhang A: ausschließbar)
	const iso = (EDGES_BY_CONTROL.get("CC-OPS-08") ?? []).filter((e) =>
		e.requirement.startsWith("iso27001:"),
	);
	const partial = iso.find((e) => e.coverage === "partial")?.requirement ?? "";
	const full = iso.find((e) => e.coverage === "full")?.requirement ?? "";
	const ops: AssessmentQuestion = {
		...q("O", [partial, full]),
		controlCode: "CC-OPS-08",
	};

	it("Beispiel aus dem Katalog trägt, was der Test annimmt", () => {
		expect(partial).not.toBe("");
		expect(full.startsWith("iso27001:A.")).toBe(true);
		expect(
			(EDGES_BY_REQUIREMENT.get(partial as `${string}:${string}`) ?? []).some(
				(e) => e.control !== "CC-OPS-08",
			),
		).toBe(true);
	});

	it("bleibt anwendbar und zählt über andere Maßnahmen, nichts bleibt offen", () => {
		const r = naImpactOf(ops);
		expect(r.excludable.map((x) => x.key)).toEqual([full]);
		expect(r.kept.map((x) => x.key)).toEqual([partial]);
		expect(r.blocked).toEqual([]);
		expect(naAllowed(ops)).toBe(true);
		expect(naDropsControl(ops)).toBe(true);
		expect(naOpenShare(ops)).toBe(0);
	});

	it("ohne andere Maßnahme bleibt eine nur teilweise getragene Anforderung offen", () => {
		const alone = new Map(EDGES_BY_REQUIREMENT);
		alone.set(
			partial as `${string}:${string}`,
			(EDGES_BY_REQUIREMENT.get(partial as `${string}:${string}`) ?? []).filter(
				(e) => e.control === "CC-OPS-08",
			),
		);
		const catalog = { ...STATIC_CATALOG, edgesByRequirement: alone };
		const r = naImpactOf(ops, catalog);
		expect(r.kept).toEqual([]);
		expect(r.blocked.map((x) => x.key)).toEqual([partial]);
		expect(naDropsControl(ops, catalog)).toBe(false);
	});

	it("wählbar, wenn etwas ausgeschlossen wird oder nichts offen bliebe", () => {
		const k = { key: "x:1", label: "x 1" };
		expect(naChoosable({ excludable: [], kept: [k], blocked: [] })).toBe(true);
		expect(naChoosable({ excludable: [], kept: [k], blocked: [k] })).toBe(
			false,
		);
		expect(
			naChoosable({
				excludable: [{ ...k, how: "SoA" }],
				kept: [],
				blocked: [k],
			}),
		).toBe(true);
	});

	it("wirkt nur bestätigt: ohne Bestätigung weder Ausschluss noch Statuswechsel", () => {
		const answers = new Map([["O", st("na", "Keine eigene Entwicklung")]]);
		const opts = { dropsControl: (x: AssessmentQuestion) => naDropsControl(x) };
		expect(
			proposeControlStatus([ops], answers, new Map(), exclusionAllowedForKey, {
				...opts,
				naConfirmed: () => false,
			}),
		).toEqual([]);
		expect(
			proposeExclusions(
				[ops],
				answers,
				exclusionAllowedForKey,
				new Set(),
				() => false,
			),
		).toEqual([]);
		// bestätigt: Maßnahme entfällt (nichts offen), A.5.37 ausgeschlossen
		expect(
			proposeControlStatus([ops], answers, new Map(), exclusionAllowedForKey, {
				...opts,
				naConfirmed: () => true,
			}),
		).toEqual([
			{
				controlCode: "CC-OPS-08",
				from: "not_started",
				to: "not_applicable",
				naReason: "Keine eigene Entwicklung",
			},
		]);
		expect(
			proposeExclusions([ops], answers, exclusionAllowedForKey).map(
				(x) => x.key,
			),
		).toEqual([full]);
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
