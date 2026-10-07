import { describe, expect, it } from "vitest";
import {
	inhaberkontrolleDeadline,
	shareholderGaps,
	thresholdCrossed,
	totalSharePct,
} from "@/lib/compliance/shareholders";

describe("shareholders / Inhaberkontrolle", () => {
	it("Schwellen 10/20/30/50 aus Anteilen oder Stimmrechten", () => {
		expect(thresholdCrossed(9.9, 0)).toBeNull();
		expect(thresholdCrossed(12, 0)).toBe(10);
		expect(thresholdCrossed(5, 25)).toBe(20);
		expect(thresholdCrossed(33, 33)).toBe(30);
		expect(thresholdCrossed(51, null)).toBe(50);
		expect(thresholdCrossed(null, null)).toBeNull();
	});

	it("Beurteilungszeitraum 60 Arbeitstage", () => {
		// Mo 05.10.2026 + 60 Arbeitstage = Mo 28.12.2026
		const due = inhaberkontrolleDeadline(new Date("2026-10-05T00:00:00Z"));
		expect(due.toISOString().slice(0, 10)).toBe("2026-12-28");
	});

	it("Gaps: Schwelle ohne Anzeige, überfällige Beurteilung, Sanktionsabgleich", () => {
		const now = new Date("2026-10-07T00:00:00Z");
		const gaps = shareholderGaps(
			[
				{
					name: "Investor A",
					sharePct: 12,
					votingPct: 12,
					inhaberkontrolleStatus: "not_required",
					notifiedAt: null,
					approvedAt: null,
					sanctionsCheckedAt: null,
				},
				{
					name: "Investor B",
					sharePct: 25,
					votingPct: 25,
					inhaberkontrolleStatus: "pending",
					notifiedAt: "2026-06-01",
					approvedAt: null,
					sanctionsCheckedAt: "2025-01-01",
				},
				{
					name: "Gründer",
					sharePct: 60,
					votingPct: 60,
					inhaberkontrolleStatus: "approved",
					notifiedAt: "2026-01-10",
					approvedAt: "2026-03-01",
					sanctionsCheckedAt: "2026-09-01",
				},
				{
					name: "Kleinanleger",
					sharePct: 3,
					votingPct: 3,
					inhaberkontrolleStatus: "not_required",
					notifiedAt: null,
					approvedAt: null,
					sanctionsCheckedAt: null,
				},
			],
			now,
		);
		expect(gaps.map((g) => `${g.name}:${g.kind}`)).toEqual([
			"Investor A:threshold_without_notice",
			"Investor A:sanctions_check_missing",
			"Investor B:assessment_overdue",
			"Investor B:sanctions_check_stale",
		]);
		expect(
			totalSharePct([
				{ sharePct: 12 },
				{ sharePct: 25 },
				{ sharePct: 60 },
				{ sharePct: 3 },
			]),
		).toBe(100);
	});
});
