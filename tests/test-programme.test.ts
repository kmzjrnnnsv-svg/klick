import { describe, expect, it } from "vitest";
import {
	programmeStatus,
	siteExerciseDue,
	type TestRow,
} from "@/lib/compliance/test-programme";

const now = new Date("2026-10-07T12:00:00Z");
const procs = [
	{ id: "p1", code: "P-01", name: "Zahlungsannahme" },
	{ id: "p4", code: "P-04", name: "Auszahlung" },
];

describe("programmeStatus", () => {
	it("zählt geplante/durchgeführte Tests des Jahres und erkennt BCM-Lücken", () => {
		const s = programmeStatus(
			2026,
			[
				{
					id: "t1",
					method: "bcm_exercise",
					plannedAt: "2026-06-01",
					testedAt: new Date("2026-06-15"),
					result: "pass",
					processId: "p1",
					nextTestAt: null,
				},
				{
					id: "t2",
					method: "pentest",
					plannedAt: "2026-09-30",
					testedAt: null,
					result: null,
					processId: null,
					nextTestAt: null,
				},
				{
					id: "t3",
					method: "access_review",
					plannedAt: null,
					testedAt: new Date("2026-04-20"),
					result: "fail",
					processId: null,
					nextTestAt: null,
				},
				{
					id: "t4",
					method: "inspection",
					plannedAt: "2025-12-01",
					testedAt: new Date("2025-12-02"),
					result: "pass",
					processId: null,
					nextTestAt: null,
				},
			],
			procs,
			now,
		);
		expect(s.planned).toBe(1);
		expect(s.performed).toBe(2);
		expect(s.passed).toBe(1);
		expect(s.failed).toBe(1);
		expect(s.overduePlanned).toBe(1); // Pentest 30.09. nicht durchgeführt
		expect(s.pentestDone).toBe(false);
		expect(s.bcmGaps.map((g) => g.code)).toEqual(["P-04"]);
		expect(s.accessReviewQuarters).toEqual([false, true, false, false]);
	});
	it("leeres Jahr: alles offen", () => {
		const s = programmeStatus(2027, [], procs, now);
		expect(s.performed).toBe(0);
		expect(s.bcmGaps).toHaveLength(2);
		expect(s.pentestDone).toBe(false);
	});
});

describe("Notfallübung je kritischem Standort (C3)", () => {
	const sites = [
		{ id: "s1", name: "Frankfurt" },
		{ id: "s2", name: "Rechenzentrum" },
		{ id: "s3", name: "Berlin" },
	];
	const row = (x: Partial<TestRow>): TestRow => ({
		id: "x",
		method: "bcm_exercise",
		plannedAt: null,
		testedAt: null,
		result: null,
		processId: null,
		siteId: null,
		nextTestAt: null,
		...x,
	});
	const tests = [
		row({ id: "a", siteId: "s1", testedAt: new Date("2026-03-10T00:00:00Z") }),
		row({ id: "b", siteId: "s2", plannedAt: "2026-11-15" }),
		row({ id: "c", siteId: "s3", testedAt: new Date("2025-05-02T00:00:00Z") }),
	];

	it("Lücken im Jahr: nur Standorte ohne durchgeführte Übung", () => {
		const s = programmeStatus(2026, tests, [], now, sites);
		expect(s.siteGaps.map((x) => x.name)).toEqual(["Rechenzentrum", "Berlin"]);
	});

	it("Fälligkeit: zwölf Monate nach der letzten Übung, geplante entfallen", () => {
		expect(siteExerciseDue(sites, tests, now)).toEqual([
			{
				id: "s1",
				name: "Frankfurt",
				dueAt: "2027-03-10",
				lastAt: "2026-03-10",
			},
			{ id: "s3", name: "Berlin", dueAt: "2026-05-02", lastAt: "2025-05-02" },
		]);
	});

	it("ohne Übung fällig bis Jahresende", () => {
		expect(siteExerciseDue([{ id: "n", name: "Neu" }], [], now)).toEqual([
			{ id: "n", name: "Neu", dueAt: "2026-12-31", lastAt: null },
		]);
	});
});
