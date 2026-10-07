import { describe, expect, it } from "vitest";
import { programmeStatus } from "@/lib/compliance/test-programme";

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
