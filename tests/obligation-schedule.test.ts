import { describe, expect, it } from "vitest";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import {
	applicableObligations,
	OBLIGATIONS,
} from "@/lib/compliance/catalog/obligations";
import { upcomingLegalChanges } from "@/lib/compliance/catalog/regulatory-calendar";
import {
	groupByMonth,
	runState,
	scheduleRuns,
} from "@/lib/compliance/obligations";

const FROM = new Date("2027-01-01T00:00:00Z");
const TO = new Date("2027-12-31T23:59:59Z");

describe("scheduleRuns", () => {
	it("annual: ein Lauf je Jahr am festen Datum", () => {
		expect(
			scheduleRuns(
				{ frequency: "annual", dueRule: { kind: "fixed", month: 7, day: 31 } },
				FROM,
				TO,
			),
		).toEqual([{ periodLabel: "2027", dueAt: "2027-07-31" }]);
	});
	it("quarterly: Q4 des Vorjahres fällt in den Januar, Q1–Q3 folgen", () => {
		const runs = scheduleRuns(
			{
				frequency: "quarterly",
				dueRule: { kind: "quarterly", dayOfMonthAfterQuarter: 15 },
			},
			FROM,
			TO,
		);
		expect(runs.map((r) => `${r.periodLabel}@${r.dueAt}`)).toEqual([
			"2026-Q4@2027-01-15",
			"2027-Q1@2027-04-15",
			"2027-Q2@2027-07-15",
			"2027-Q3@2027-10-15",
		]);
	});
	it("semiannual: zwei Läufe mit zweitem Monat; monthly: zwölf Läufe; Monatsende wird gekappt", () => {
		const semi = scheduleRuns(
			{
				frequency: "semiannual",
				dueRule: { kind: "fixed", month: 2, day: 31 },
				secondMonth: 8,
			},
			FROM,
			TO,
		);
		expect(semi).toEqual([
			{ periodLabel: "2027-H1", dueAt: "2027-02-28" },
			{ periodLabel: "2027-H2", dueAt: "2027-08-31" },
		]);
		const monthly = scheduleRuns(
			{ frequency: "monthly", dueRule: { kind: "monthly", day: 7 } },
			FROM,
			TO,
		);
		expect(monthly).toHaveLength(12);
		expect(monthly[0]).toEqual({ periodLabel: "2027-01", dueAt: "2027-01-07" });
	});
	it("triennial: nur alle drei Jahre ab Ankerjahr; per_event/daily ohne Läufe", () => {
		const tri = scheduleRuns(
			{
				frequency: "triennial",
				dueRule: { kind: "fixed", month: 12, day: 31 },
				anchorYear: 2026,
			},
			new Date("2026-01-01T00:00:00Z"),
			new Date("2032-12-31T00:00:00Z"),
		);
		expect(tri.map((r) => r.periodLabel)).toEqual(["2026", "2029", "2032"]);
		expect(scheduleRuns({ frequency: "daily" }, FROM, TO)).toEqual([]);
		expect(scheduleRuns({ frequency: "per_event" }, FROM, TO)).toEqual([]);
	});
	it("ist idempotent: gleiche Eingabe → gleiche Labels", () => {
		const a = scheduleRuns(
			{ frequency: "annual", dueRule: { kind: "fixed", month: 3, day: 30 } },
			FROM,
			TO,
		);
		const b = scheduleRuns(
			{ frequency: "annual", dueRule: { kind: "fixed", month: 3, day: 30 } },
			FROM,
			TO,
		);
		expect(a).toEqual(b);
	});
});

describe("runState", () => {
	const now = new Date("2027-03-20T10:00:00Z");
	it("upcoming → due (im Vorlauf) → overdue → done", () => {
		expect(
			runState(
				{ dueAt: "2027-06-30", completedAt: null, status: "upcoming" },
				14,
				now,
			),
		).toBe("upcoming");
		expect(
			runState(
				{ dueAt: "2027-03-30", completedAt: null, status: "upcoming" },
				14,
				now,
			),
		).toBe("due");
		expect(
			runState(
				{ dueAt: "2027-03-10", completedAt: null, status: "due" },
				14,
				now,
			),
		).toBe("overdue");
		expect(
			runState(
				{
					dueAt: "2027-03-10",
					completedAt: new Date("2027-03-09"),
					status: "done",
				},
				14,
				now,
			),
		).toBe("done");
		expect(
			runState(
				{ dueAt: "2027-03-10", completedAt: null, status: "waived" },
				14,
				now,
			),
		).toBe("waived");
	});
});

describe("Pflichten-Katalog", () => {
	it("Codes eindeutig, geplante Frequenzen haben eine passende DueRule, Controls auflösbar", () => {
		expect(new Set(OBLIGATIONS.map((o) => o.code)).size).toBe(
			OBLIGATIONS.length,
		);
		for (const o of OBLIGATIONS) {
			if (["annual", "semiannual", "triennial"].includes(o.frequency))
				expect(o.dueRule?.kind).toBe("fixed");
			if (o.frequency === "quarterly")
				expect(o.dueRule?.kind).toBe("quarterly");
			if (o.frequency === "monthly") expect(o.dueRule?.kind).toBe("monthly");
			if (o.control) expect(CONTROL_BY_CODE.has(o.control)).toBe(true);
		}
	});
	it("Stufe 0 mit ISO+DORA: ISMS-Pflichten, aber keine Eigenmittel oder Monatsausweise", () => {
		const codes = applicableObligations(
			["iso27001", "dora"],
			"0_vorbereitung",
		).map((o) => o.code);
		expect(codes).toContain("OBL-ISMS-MGMT-REVIEW");
		expect(codes).toContain("OBL-RESTORE-TEST");
		expect(codes).not.toContain("OBL-OWN-FUNDS-Q");
		expect(codes).not.toContain("OBL-ZAG-MONTHLY");
		expect(codes).not.toContain("OBL-TLPT");
	});
	it("CASP Stufe 2: Businessplan-18.9-Läufe vorhanden; TLPT nur bei Benennung", () => {
		const fws = [
			"iso27001",
			"dora",
			"micar",
			"zag",
			"zag-marisk",
			"gwg",
			"dac8",
			"awv",
		];
		const codes = applicableObligations(fws, "2_casp_zag").map((o) => o.code);
		for (const c of [
			"OBL-OWN-FUNDS-Q",
			"OBL-DORA-REGISTER",
			"OBL-DAC8",
			"OBL-ANNUAL-ACCOUNTS",
			"OBL-GWG-ANNUAL-REPORT",
			"OBL-AWV-MONTHLY",
			"OBL-ZAG-OPRISK-REPORT",
			"OBL-ZAG-MONTHLY",
		])
			expect(codes).toContain(c);
		expect(codes).not.toContain("OBL-TLPT");
		expect(
			applicableObligations(fws, "2_casp_zag", { tlptDesignated: true }).map(
				(o) => o.code,
			),
		).toContain("OBL-TLPT");
	});
	it("Jahresansicht gruppiert nach Monat", () => {
		const grouped = groupByMonth(
			[
				{ dueAt: "2027-03-30" },
				{ dueAt: "2027-03-31" },
				{ dueAt: "2027-07-31" },
				{ dueAt: "2026-12-15" },
			],
			2027,
		);
		expect(grouped.get(3)).toHaveLength(2);
		expect(grouped.get(7)).toHaveLength(1);
		expect(grouped.get(12)).toHaveLength(0);
	});
});

describe("upcomingLegalChanges", () => {
	it("AMLR am 10.07.2027 erscheint sechs Monate vorher, nicht sieben", () => {
		expect(
			upcomingLegalChanges(new Date("2027-01-11T00:00:00Z"), 180).map(
				(c) => c.title,
			),
		).toEqual(expect.arrayContaining([expect.stringContaining("AMLR")]));
		expect(
			upcomingLegalChanges(new Date("2026-12-01T00:00:00Z"), 180).some((c) =>
				c.title.includes("AMLR"),
			),
		).toBe(false);
	});
	it("filtert nach Rahmenwerken", () => {
		const only = upcomingLegalChanges(new Date("2027-01-15T00:00:00Z"), 400, [
			"dac8",
		]);
		expect(only.every((c) => c.frameworks.includes("dac8"))).toBe(true);
		expect(only.length).toBeGreaterThan(0);
	});
});
