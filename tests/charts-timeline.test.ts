import { describe, expect, it } from "vitest";
import { addDays, monthTicks, timelinePosition } from "@/lib/charts/timeline";

describe("Zeitleiste", () => {
	it("rechnet die Lage zwischen Beginn und Ende", () => {
		expect(timelinePosition("2026-01-01", "2026-01-11", "2026-01-06")).toBe(
			0.5,
		);
		expect(timelinePosition("2026-01-01", "2026-01-11", "2025-12-01")).toBe(0);
		expect(timelinePosition("2026-01-01", "2026-01-11", "2027-01-01")).toBe(1);
		expect(timelinePosition("2026-01-01", "2026-01-01", "2026-01-01")).toBe(0);
	});

	it("zählt Tage über die Sommerzeit hinweg", () => {
		expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
		expect(addDays("2026-11-03", 365)).toBe("2027-11-03");
	});

	it("setzt Teilstriche an jeden Monatsanfang", () => {
		const ticks = monthTicks("2026-11-03", "2027-02-15");
		expect(ticks.map((t) => t.date)).toEqual([
			"2026-12-01",
			"2027-01-01",
			"2027-02-01",
		]);
		expect(ticks[0]?.position).toBeGreaterThan(0);
		expect(ticks.at(-1)?.position).toBeLessThan(1);
		expect(monthTicks("2026-11-01", "2026-11-20")).toEqual([]);
	});
});
