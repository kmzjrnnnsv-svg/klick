import { describe, expect, it } from "vitest";
import {
	addMonths,
	indicatorState,
	parseNumeric,
	valueState,
} from "@/lib/compliance/indicators";

describe("parseNumeric", () => {
	it("liest deutsche und englische Schreibweisen", () => {
		expect(parseNumeric("92 %")).toBe(92);
		expect(parseNumeric("1.234,5")).toBe(1234.5);
		expect(parseNumeric("0,8")).toBe(0.8);
		expect(parseNumeric("1.234")).toBe(1234);
		expect(parseNumeric("3.5")).toBe(3.5);
		expect(parseNumeric("—")).toBeNull();
	});
});

describe("valueState / indicatorState", () => {
	const kpi = {
		direction: "higher_better" as const,
		targetValue: 95,
		warnAt: 90,
		alertAt: 80,
		nextMeasureAt: "2026-12-31",
	};
	const kri = {
		direction: "lower_better" as const,
		targetValue: 5,
		warnAt: 10,
		alertAt: 25,
		nextMeasureAt: null,
	};
	it("KPI unter Alarmschwelle, KRI über Alarmschwelle", () => {
		expect(valueState(78, kpi)).toBe("alert");
		expect(valueState(85, kpi)).toBe("warn");
		expect(valueState(96, kpi)).toBe("ok");
		expect(valueState(30, kri)).toBe("alert");
		expect(valueState(12, kri)).toBe("warn");
	});
	it("ohne Schwellen zählt der Zielwert", () => {
		expect(
			valueState(4, {
				direction: "higher_better",
				targetValue: 5,
				warnAt: null,
				alertAt: null,
			}),
		).toBe("warn");
	});
	it("Messung überfällig, Trend und Verlauf", () => {
		const r = indicatorState(
			{ ...kpi, nextMeasureAt: "2026-10-01" },
			[
				{ measuredAt: "2026-07-01", numericValue: 88 },
				{ measuredAt: "2026-04-01", numericValue: 91 },
				{ measuredAt: "2026-09-01", numericValue: 93 },
			],
			"2026-10-17",
		);
		expect(r).toMatchObject({
			state: "overdue_measurement",
			latest: 93,
			trend: "better",
			series: [91, 88, 93],
		});
		expect(indicatorState(kpi, [], "2026-10-17").state).toBe("no_data");
	});
	it("Alarm schlägt überfällige Messung", () => {
		expect(
			indicatorState(
				{ ...kri, nextMeasureAt: "2026-01-01" },
				[{ measuredAt: "2026-09-01", numericValue: 40 }],
				"2026-10-17",
			).state,
		).toBe("alert");
	});
});

describe("addMonths", () => {
	it("Monatsende bleibt im Monat", () => {
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonths("2026-10-17", 3)).toBe("2027-01-17");
	});
});
