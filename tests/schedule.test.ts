import { describe, expect, it } from "vitest";
import type { ImplStatus } from "@/db/schema/enums";
import {
	addWorkdays,
	DOCUMENT_DAYS,
	EFFORT_DAYS,
	estimateDays,
	frameworkReadiness,
	nextMonday,
	planSettingsOf,
	type ScheduleMeasure,
	schedulePlan,
} from "@/lib/assessments/schedule";
import type { CatalogOrderControl } from "@/lib/compliance/catalog/control-order";

// Teil C: Umsetzungsplan (rein). Kalender Mo–Fr, Dauer je Aufwand,
// Vorgänger, Spuren je Funktion, Kapazität, Bereitschaft je Rahmenwerk.

// Kunstkatalog: keine gepflegte Reihenfolge, Bereiche getrennt
const ctl = (
	code: string,
	domain: CatalogOrderControl["domain"] = "operations",
	kind: CatalogOrderControl["kind"] = "process",
): [string, CatalogOrderControl] => [
	code,
	{ code: code as CatalogOrderControl["code"], domain, kind },
];
const m = (
	controlCode: string,
	effort: "S" | "M" | "L" = "S",
	kind: ScheduleMeasure["kind"] = "implement",
): ScheduleMeasure => ({ controlCode, effort, kind });

// 2026-11-09 ist ein Montag
const START = "2026-11-09";

describe("Kalender", () => {
	it("zählt nur Montag bis Freitag", () => {
		expect(addWorkdays(START, 0)).toBe(START);
		expect(addWorkdays(START, 4)).toBe("2026-11-13");
		expect(addWorkdays(START, 5)).toBe("2026-11-16");
		// Beginn am Samstag rückt auf Montag
		expect(addWorkdays("2026-11-14", 0)).toBe("2026-11-16");
	});

	it("beginnt am nächsten Montag", () => {
		expect(nextMonday("2026-11-04")).toBe(START);
		expect(nextMonday(START)).toBe(START);
		expect(nextMonday("2026-11-08")).toBe(START);
	});
});

describe("Dauer", () => {
	it("schätzt nach Aufwand, halbiert bei teilweise, plus Umlauf", () => {
		const no = { partial: false, documentation: false };
		expect(estimateDays(m("A", "S"), no)).toBe(EFFORT_DAYS.S);
		expect(estimateDays(m("A", "M"), no)).toBe(EFFORT_DAYS.M);
		expect(estimateDays(m("A", "L"), { ...no, partial: true })).toBe(
			EFFORT_DAYS.L / 2,
		);
		expect(estimateDays(m("A", "M"), { ...no, documentation: true })).toBe(
			EFFORT_DAYS.M + DOCUMENT_DAYS,
		);
		expect(estimateDays(m("A", "L", "clarify"), no)).toBe(2);
		expect(estimateDays(m("A", "L", "evidence"), no)).toBe(3);
	});

	it("liest Einstellungen streng", () => {
		const s = planSettingsOf(
			{
				start: "2027-01-04",
				capacity: 9,
				overrides: { "CC-GOV-01": 7, "CC-X-1": 0, evil: 3, "CC-AST-01": 1.5 },
			},
			"2026-11-04",
		);
		expect(s.start).toBe("2027-01-04");
		expect(s.capacity).toBe(5);
		expect(s.overrides).toEqual({ "CC-GOV-01": 7 });
		expect(s.saved).toBe(true);
		const d = planSettingsOf(null, "2026-11-04");
		expect(d).toMatchObject({ start: START, capacity: 2, saved: false });
	});
});

describe("Planung", () => {
	const controls = new Map([
		ctl("A", "asset"),
		ctl("B", "network"),
		ctl("C", "crypto"),
		ctl("D", "hr"),
	]);
	const laneOwn = (code: string) => code;

	it("hält die Kapazität ein", () => {
		const s = schedulePlan({
			measures: [m("A"), m("B"), m("C"), m("D")],
			controls,
			partial: new Set(),
			laneOf: laneOwn,
			settings: { start: START, capacity: 2 },
		});
		expect(s.items.map((i) => [i.controlCode, i.startDay])).toEqual([
			["A", 0],
			["B", 0],
			["C", 5],
			["D", 5],
		]);
		expect(s.workdays).toBe(10);
		expect(s.end).toBe("2026-11-20");
	});

	it("legt dieselbe Funktion nacheinander", () => {
		const s = schedulePlan({
			measures: [m("A"), m("B")],
			controls,
			partial: new Set(),
			laneOf: () => "isb_ciso",
			settings: { start: START, capacity: 5 },
		});
		expect(s.items.map((i) => i.startDay)).toEqual([0, 5]);
	});

	it("beginnt erst nach den Vorgängern", () => {
		// Richtlinie im selben Bereich vor technischer Maßnahme
		const withDoc = new Map([
			ctl("T", "access", "technical"),
			ctl("R", "access", "documentation"),
		]);
		const s = schedulePlan({
			// Hebel-Reihenfolge stellt die Technik zuerst
			measures: [m("T", "S"), m("R", "S")],
			controls: withDoc,
			partial: new Set(),
			laneOf: laneOwn,
			settings: { start: START, capacity: 3 },
		});
		const r = s.items.find((i) => i.controlCode === "R");
		const t = s.items.find((i) => i.controlCode === "T");
		// Richtlinie: 5 + 5 Tage Umlauf
		expect(r?.days).toBe(EFFORT_DAYS.S + DOCUMENT_DAYS);
		expect(t?.after).toEqual(["R"]);
		expect(t?.startDay).toBe(r?.endDay);
	});

	it("nimmt eigene Dauer und halbiert teilweise Umgesetztes", () => {
		const s = schedulePlan({
			measures: [m("A", "L"), m("B", "L")],
			controls,
			partial: new Set(["B"]),
			laneOf: laneOwn,
			settings: { start: START, capacity: 2, overrides: { A: 3 } },
		});
		expect(s.items.map((i) => [i.days, i.overridden])).toEqual([
			[3, true],
			[20, false],
		]);
	});
});

describe("Bereitschaft je Rahmenwerk", () => {
	const controls = new Map([ctl("A"), ctl("B"), ctl("C")]);
	// A 5 Tage, B 15 Tage, C 40 Tage, alle parallel
	const schedule = schedulePlan({
		measures: [m("A", "S"), m("B", "M"), m("C", "L")],
		controls,
		partial: new Set(),
		laneOf: (c) => c,
		settings: { start: START, capacity: 3 },
	});
	const req = (framework: string, code: string) => ({
		framework,
		code,
		domain: "operations" as const,
	});
	const ready = (
		edges: {
			control: string;
			requirement: string;
			coverage: "full" | "partial";
		}[],
		impl: [string, ImplStatus][] = [],
	) =>
		frameworkReadiness({
			frameworks: ["fw"],
			schedule,
			catalog: { requirements: [req("fw", "1")], edges },
			implStatus: new Map(impl),
		})[0];

	it("ist mit der frühesten vollen Kante fertig", () => {
		const r = ready([
			{ control: "A", requirement: "fw:1", coverage: "full" },
			{ control: "C", requirement: "fw:1", coverage: "full" },
		]);
		expect(r?.readyDay).toBe(5);
		expect(r?.readyAt).toBe("2026-11-13");
	});

	it("mit drei teilweisen Kanten erst mit der spätesten", () => {
		const r = ready([
			{ control: "A", requirement: "fw:1", coverage: "partial" },
			{ control: "B", requirement: "fw:1", coverage: "partial" },
			{ control: "C", requirement: "fw:1", coverage: "partial" },
		]);
		expect(r?.readyDay).toBe(40);
		expect(r?.chain).toEqual(["C"]);
		expect(r?.measures).toBe(3);
	});

	it("zählt bereits Umgesetztes und meldet Unerreichtes", () => {
		const done = ready(
			[{ control: "X", requirement: "fw:1", coverage: "full" }],
			[["X", "implemented"]],
		);
		expect(done).toMatchObject({ readyDay: 0, missing: 0 });
		const open = ready([
			{ control: "X", requirement: "fw:1", coverage: "full" },
		]);
		expect(open).toMatchObject({ readyAt: null, missing: 1 });
	});

	it("ignoriert nicht anwendbare Anforderungen", () => {
		const r = frameworkReadiness({
			frameworks: ["fw"],
			schedule,
			catalog: {
				requirements: [req("fw", "1")],
				edges: [{ control: "C", requirement: "fw:1", coverage: "full" }],
				applicability: new Map([["fw:1", false]]),
			},
			implStatus: new Map(),
		})[0];
		expect(r).toMatchObject({ readyDay: 0, missing: 0, measures: 0 });
	});
});
