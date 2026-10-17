import { describe, expect, it } from "vitest";
import {
	aggregateCases,
	clockState,
	complaintDeadlines,
	nextCaseCode,
	whistleblowingDeadlines,
} from "@/lib/compliance/complaints";

const received = new Date("2026-10-07T10:00:00Z");

describe("Fristen", () => {
	it("Beschwerde: Eingangsbestätigung 5 Arbeitstage, Antwort 2 Monate (MiCAR Art. 71)", () => {
		const d = complaintDeadlines(received);
		// Mi 07.10. → Do, Fr, Mo, Di, Mi → 14.10.
		expect(d.ackDueAt.toISOString().slice(0, 10)).toBe("2026-10-14");
		expect(d.responseDueAt.toISOString().slice(0, 10)).toBe("2026-12-07");
	});
	it("Hinweis: Bestätigung 7 Tage, Rückmeldung 3 Monate (HinSchG § 17)", () => {
		const d = whistleblowingDeadlines(received);
		expect(d.ackDueAt.toISOString().slice(0, 10)).toBe("2026-10-14");
		expect(d.feedbackDueAt.toISOString().slice(0, 10)).toBe("2027-01-07");
	});
	it("Monatsende wird geklemmt (BGB § 188 Abs. 3)", () => {
		// 30.11.2026 + 3 Monate = 28.02.2027 (nicht 02.03.)
		const wb = whistleblowingDeadlines(new Date("2026-11-30T10:00:00Z"));
		expect(wb.feedbackDueAt).toEqual(new Date("2027-02-28T22:59:59.999Z"));
		// 31.12.2026 + 2 Monate = 28.02.2027 (nicht 03.03.)
		const c = complaintDeadlines(new Date("2026-12-31T10:00:00Z"));
		expect(c.responseDueAt).toEqual(new Date("2027-02-28T22:59:59.999Z"));
	});
});

describe("clockState", () => {
	const due = new Date("2026-10-10T10:00:00Z");
	it("erledigt > überfällig > bald > ok", () => {
		expect(clockState(due, new Date(), new Date("2026-10-20"))).toBe("done");
		expect(clockState(due, null, new Date("2026-10-11"))).toBe("overdue");
		expect(clockState(due, null, new Date("2026-10-09T12:00:00Z"))).toBe(
			"soon",
		);
		expect(clockState(due, null, new Date("2026-10-01"))).toBe("ok");
		expect(clockState(null, null, new Date())).toBe("ok");
	});
});

describe("Codes und Aggregation", () => {
	it("Codes laufen je Jahr und Präfix fort", () => {
		expect(
			nextCaseCode(["BES-2026-001", "HIN-2026-004"], "BES", received),
		).toBe("BES-2026-002");
		expect(
			nextCaseCode(["BES-2026-001", "HIN-2026-004"], "HIN", received),
		).toBe("HIN-2026-005");
	});
	it("aggregiert ohne Details: offen, überfällige Bestätigungen/Antworten, letzte 90 Tage", () => {
		const now = new Date("2026-10-07T12:00:00Z");
		const rows = [
			{
				status: "open",
				receivedAt: new Date("2026-09-20"),
				ackDueAt: new Date("2026-09-25"),
				acknowledgedAt: null,
				responseDueAt: new Date("2026-11-20"),
				resolvedAt: null,
			},
			{
				status: "closed",
				receivedAt: new Date("2026-05-01"),
				ackDueAt: new Date("2026-05-06"),
				acknowledgedAt: new Date("2026-05-02"),
				responseDueAt: new Date("2026-07-01"),
				resolvedAt: new Date("2026-06-15"),
			},
			{
				status: "acknowledged",
				receivedAt: new Date("2026-07-01"),
				ackDueAt: new Date("2026-07-06"),
				acknowledgedAt: new Date("2026-07-02"),
				responseDueAt: new Date("2026-09-01"),
				resolvedAt: null,
			},
		];
		const agg = aggregateCases(
			rows,
			now,
			(r) => r.responseDueAt,
			(r) => r.resolvedAt,
		);
		expect(agg).toEqual({
			total: 3,
			open: 2,
			ackOverdue: 1,
			responseOverdue: 1,
			last90Days: 1,
		});
	});
});
