import { describe, expect, it } from "vitest";
import {
	addMonths,
	dsrClock,
	dsrDueAt,
	dsrExtendedUntil,
	dsrStats,
	insuranceState,
	vvtGaps,
} from "@/lib/compliance/privacy";

describe("privacy helpers", () => {
	it("Monatsfrist Art. 12(3): Kalendermonat, Monatsende begrenzt", () => {
		expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe(
			"2026-02-28T10:00:00.000Z",
		);
		expect(dsrDueAt(new Date("2026-10-07T09:00:00Z")).toISOString()).toBe(
			"2026-11-07T09:00:00.000Z",
		);
		expect(
			dsrExtendedUntil(new Date("2026-11-07T09:00:00Z")).toISOString(),
		).toBe("2027-01-07T09:00:00.000Z");
	});

	it("Uhr: offen → bald → überfällig → erledigt; Verlängerung zählt", () => {
		const now = new Date("2026-11-05T00:00:00Z");
		const base = {
			dueAt: new Date("2026-11-07T00:00:00Z"),
			extendedUntil: null,
			completedAt: null,
			status: "open" as const,
		};
		expect(dsrClock(base, now)).toBe("soon");
		expect(
			dsrClock({ ...base, dueAt: new Date("2026-11-01T00:00:00Z") }, now),
		).toBe("overdue");
		expect(
			dsrClock(
				{
					...base,
					dueAt: new Date("2026-11-01T00:00:00Z"),
					extendedUntil: new Date("2027-01-01T00:00:00Z"),
				},
				now,
			),
		).toBe("ok");
		expect(dsrClock({ ...base, status: "done", completedAt: now }, now)).toBe(
			"done",
		);
		const s = dsrStats(
			[
				base,
				{ ...base, dueAt: new Date("2026-10-01T00:00:00Z") },
				{ ...base, status: "done", completedAt: now },
			],
			now,
		);
		expect(s.open).toBe(2);
		expect(s.overdue).toBe(1);
		expect(s.doneThisYear).toBe(1);
	});

	it("Versicherungsstatus mit 60-Tage-Warnung", () => {
		const now = new Date("2026-10-07T00:00:00Z");
		expect(insuranceState(null, now)).toBe("none");
		expect(insuranceState("2027-06-30", now)).toBe("active");
		expect(insuranceState("2026-11-15", now)).toBe("expiring");
		expect(insuranceState("2026-09-30", now)).toBe("expired");
	});

	it("VVT-Lücken: Rechtsgrundlage, Löschfrist, DSFA ohne Nachweis", () => {
		const gaps = vvtGaps([
			{
				id: "a",
				name: "KYC",
				legalBasis: "GwG § 11a",
				retention: "5 Jahre",
				thirdCountryTransfer: null,
				dsfaRequired: true,
				dsfaEvidenceId: null,
				recipients: [],
			},
			{
				id: "b",
				name: "Newsletter",
				legalBasis: null,
				retention: null,
				thirdCountryTransfer: "US (DPF)",
				dsfaRequired: false,
				dsfaEvidenceId: null,
				recipients: ["Brevo"],
			},
		]);
		expect(gaps.map((g) => `${g.id}:${g.kind}`)).toEqual([
			"a:dsfa_without_evidence",
			"b:no_legal_basis",
			"b:no_retention",
		]);
	});
});
