import { describe, expect, it } from "vitest";
import { postureTrend } from "@/lib/compliance/posture";
import { RETENTION, retentionCutoffs } from "@/lib/jobs/retention";

describe("retention cutoffs", () => {
	it("berechnet die Grenzen aus den Konstanten — nie audit_log", () => {
		const now = new Date("2026-10-07T03:00:00Z");
		const c = retentionCutoffs(now);
		expect(c.notifications.toISOString().slice(0, 10)).toBe("2026-04-10");
		expect(c.sessions.toISOString().slice(0, 10)).toBe("2026-09-07");
		expect(c.verifications.toISOString().slice(0, 10)).toBe("2026-10-06");
		expect(RETENTION.readNotificationDays).toBe(180);
		expect(Object.keys(c)).not.toContain("auditLog");
	});
});

describe("posture trend", () => {
	it("Delta und Punkte innerhalb des Fensters", () => {
		const now = new Date("2026-10-07T00:00:00Z");
		const t = postureTrend(
			[
				{ date: "2026-08-01", coveragePct: 10 },
				{ date: "2026-09-10", coveragePct: 40 },
				{ date: "2026-09-25", coveragePct: 45.5 },
				{ date: "2026-10-06", coveragePct: 52 },
			],
			now,
		);
		expect(t.points).toEqual([40, 45.5, 52]);
		expect(t.deltaPct).toBe(12);
		expect(postureTrend([], now).deltaPct).toBeNull();
	});
});
