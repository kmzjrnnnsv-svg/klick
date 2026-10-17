import { describe, expect, it } from "vitest";
import {
	combineReadiness,
	deriveReadiness,
	evidenceValid,
	type ReadinessControl,
	type ReadinessInput,
	stichtagOptions,
	testState,
} from "@/lib/compliance/readiness";

const asOf = new Date("2026-10-16T12:00:00Z");
const ctl = (over: Partial<ReadinessControl> = {}): ReadinessControl => ({
	title: "Control",
	effort: "M",
	implStatus: "implemented",
	testRequired: false,
	evidence: [{ validUntil: null, createdAt: new Date("2026-01-01") }],
	tests: [],
	...over,
});

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
	return {
		framework: "fw",
		asOf,
		requirements: [
			{ key: "fw:1", sectionCode: "A", status: "covered" },
			{ key: "fw:2", sectionCode: "A", status: "covered" },
		],
		edges: [
			{ control: "CC-A-01", requirement: "fw:1", coverage: "full" },
			{ control: "CC-A-02", requirement: "fw:2", coverage: "full" },
		],
		controls: new Map([
			["CC-A-01", ctl()],
			["CC-A-02", ctl()],
		]),
		mandatoryDocs: [],
		nonconformities: [],
		findings: [],
		...over,
	};
}

describe("Bausteine", () => {
	it("Nachweis gilt nur, wenn er am Stichtag existiert und nicht abgelaufen ist", () => {
		expect(evidenceValid(ctl(), asOf)).toBe(true);
		expect(
			evidenceValid(
				ctl({
					evidence: [
						{ validUntil: "2026-10-01", createdAt: new Date("2026-01-01") },
					],
				}),
				asOf,
			),
		).toBe(false);
		// künftiger Stichtag: heute gültig, dann abgelaufen
		const later = new Date("2027-12-11");
		expect(
			evidenceValid(
				ctl({
					evidence: [
						{ validUntil: "2027-06-30", createdAt: new Date("2026-01-01") },
					],
				}),
				later,
			),
		).toBe(false);
	});

	it("Test-Frische und Ergebnis", () => {
		const t = (testedAt: string, result: "pass" | "partial" | "fail") =>
			ctl({
				testRequired: true,
				tests: [{ testedAt: new Date(testedAt), result, nextTestAt: null }],
			});
		expect(testState(t("2026-06-01", "pass"), asOf, 12)).toBe("ok");
		expect(testState(t("2025-06-01", "pass"), asOf, 12)).toBe("missing");
		expect(testState(t("2026-06-01", "partial"), asOf, 12)).toBe("partial");
		expect(testState(t("2026-06-01", "fail"), asOf, 12)).toBe("failed");
		expect(testState(ctl(), asOf, 12)).toBe("not_needed");
	});
});

describe("deriveReadiness", () => {
	it("umgesetzt, belegt, ohne Testpflicht → 100 und bereit", () => {
		const r = deriveReadiness(input());
		expect(r.score).toBe(100);
		expect(r.verdict).toBe("ready");
		expect(r.blockers).toEqual([]);
	});

	it("umgesetzt ohne Nachweis → halbe Punkte, Blocker evidence_missing", () => {
		const r = deriveReadiness(
			input({
				controls: new Map([
					["CC-A-01", ctl({ evidence: [] })],
					["CC-A-02", ctl()],
				]),
			}),
		);
		// q1: 1·(0,5 + 0,2) = 0,7; q2: 1 → Basis 0,85
		expect(r.score).toBe(85);
		expect(r.blockers[0]).toMatchObject({
			kind: "evidence_missing",
			ref: "CC-A-01",
		});
		expect(r.dimensions.evidence).toBe(50);
	});

	it("offene Anforderung → Control-Blocker mit Punktgewinn, günstiges Control zuerst", () => {
		const r = deriveReadiness(
			input({
				requirements: [
					{ key: "fw:1", sectionCode: "A", status: "open" },
					{ key: "fw:2", sectionCode: "B", status: "covered" },
				],
				edges: [
					{ control: "CC-A-01", requirement: "fw:1", coverage: "full" },
					{ control: "CC-A-03", requirement: "fw:1", coverage: "full" },
					{ control: "CC-A-02", requirement: "fw:2", coverage: "full" },
				],
				controls: new Map([
					["CC-A-01", ctl({ implStatus: "not_started", effort: "L" })],
					["CC-A-03", ctl({ implStatus: "not_started", effort: "S" })],
					["CC-A-02", ctl()],
				]),
			}),
		);
		expect(r.score).toBe(50);
		expect(r.verdict).toBe("not_ready");
		const b = r.blockers.find((x) => x.kind === "control_not_implemented");
		expect(b?.ref).toBe("CC-A-03");
		expect(b?.gain).toBe(50);
		expect(r.bySection).toEqual([
			{ sectionCode: "A", score: 0, applicable: 1 },
			{ sectionCode: "B", score: 100, applicable: 1 },
		]);
	});

	it("Pflichtdokument fehlt → kritischer Blocker, 15 % Gewicht", () => {
		const r = deriveReadiness(
			input({
				mandatoryDocs: [
					{ templateCode: "RL-X", title: "Leitlinie", doc: null },
					{
						templateCode: "RL-Y",
						title: "Plan",
						doc: {
							docNumber: "RL-001",
							status: "published",
							nextReviewAt: null,
						},
					},
				],
			}),
		);
		expect(r.score).toBe(93); // 85 + 7,5
		expect(r.verdict).toBe("almost");
		expect(r.blockers[0]).toMatchObject({
			kind: "document_missing",
			severity: "critical",
		});
	});

	it("Abweichungen ziehen ab (gedeckelt), fremde Controls zählen nicht", () => {
		const nc = (id: string, codes: string[], priority: string | null) => ({
			id,
			code: id,
			title: id,
			status: "open",
			priority,
			dueAt: null,
			controlCodes: codes,
		});
		const r = deriveReadiness(
			input({
				nonconformities: [
					nc("A-1", ["CC-A-01"], "high"),
					nc("A-2", [], null),
					nc("A-3", ["CC-ZZ-99"], "critical"),
				],
			}),
		);
		expect(r.penalty.nonconformities).toBe(7);
		expect(r.score).toBe(93);
		expect(r.blockers.map((b) => b.ref)).toEqual(["A-1", "A-2"]);
	});

	it("fehlgeschlagener Test ist kritisch", () => {
		const r = deriveReadiness(
			input({
				controls: new Map([
					[
						"CC-A-01",
						ctl({
							testRequired: true,
							tests: [
								{
									testedAt: new Date("2026-09-01"),
									result: "fail",
									nextTestAt: null,
								},
							],
						}),
					],
					["CC-A-02", ctl()],
				]),
			}),
		);
		expect(r.blockers.some((b) => b.kind === "test_failed")).toBe(true);
		expect(r.criticalBlockers).toBe(1);
		expect(r.verdict).not.toBe("ready");
	});

	it("keine anwendbaren Anforderungen → n_a", () => {
		const r = deriveReadiness(
			input({
				requirements: [{ key: "fw:1", status: "not_applicable" }],
			}),
		);
		expect(r).toMatchObject({ score: null, verdict: "n_a" });
	});

	it("PBC fließt ins Audit-Urteil ein", () => {
		const r = deriveReadiness(
			input({
				pbc: {
					total: 4,
					answered: 0,
					accepted: 2,
					open: [{ id: "p1", title: "Logs", dueAt: null }],
					rejected: [{ id: "p2", title: "Backup" }],
				},
			}),
		);
		// 0,85·100 + 0,15·50
		expect(r.score).toBe(93);
		expect(r.blockers.map((b) => b.kind).sort()).toEqual([
			"pbc_open",
			"pbc_rejected",
		]);
	});
});

describe("combineReadiness / stichtagOptions", () => {
	it("gewichtet nach anwendbaren Anforderungen, Blocker einmal je Control", () => {
		const a = deriveReadiness(
			input({
				controls: new Map([
					["CC-A-01", ctl({ evidence: [] })],
					["CC-A-02", ctl()],
				]),
			}),
		);
		const b = deriveReadiness({ ...input(), framework: "fw2" });
		const c = combineReadiness([a, b]);
		expect(c.score).toBe(93);
		expect(c.blockers.filter((x) => x.ref === "CC-A-01")).toHaveLength(1);
	});

	it("Stichtage: heute + künftige, sortiert, ohne Duplikate", () => {
		expect(
			stichtagOptions(["2027-12-11", "2026-09-11", null, "2027-12-11"], asOf, [
				"2027-03-01",
			]),
		).toEqual(["2026-10-16", "2027-03-01", "2027-12-11"]);
	});
});
