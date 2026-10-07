import { describe, expect, it } from "vitest";
import { tlptStatus } from "@/lib/compliance/tlpt";

const now = new Date("2026-10-07T00:00:00Z");

describe("tlptStatus", () => {
	it("ohne Benennung nicht anwendbar (Negativnachweis), keine Uhr", () => {
		expect(tlptStatus({ designated: false, lastTlptAt: null, now })).toEqual({
			state: "not_applicable",
			dueAt: null,
			daysLeft: null,
		});
	});
	it("benannt ohne bisherigen Test: never", () => {
		expect(tlptStatus({ designated: true, lastTlptAt: null, now }).state).toBe(
			"never",
		);
	});
	it("drei Jahre nach dem letzten Test fällig; 180 Tage vorher „soon“; danach überfällig", () => {
		const ok = tlptStatus({ designated: true, lastTlptAt: "2025-01-01", now });
		expect(ok.state).toBe("ok");
		expect(ok.dueAt?.toISOString().slice(0, 10)).toBe("2028-01-01");
		const soon = tlptStatus({
			designated: true,
			lastTlptAt: "2023-12-01",
			now,
		});
		expect(soon.state).toBe("soon");
		const overdue = tlptStatus({
			designated: true,
			lastTlptAt: "2023-01-01",
			now,
		});
		expect(overdue.state).toBe("overdue");
		expect(overdue.daysLeft).toBeLessThan(0);
	});
});
