import { describe, expect, it } from "vitest";
import { lineGeometry, nearestIndex } from "@/lib/charts/line";

const box = { width: 120, height: 60, pad: 10 };

describe("Liniendiagramm", () => {
	it("legt Punkte nach Datum und Wert in den Rahmen", () => {
		const g = lineGeometry(
			[
				{ date: "2026-01-01", value: 0 },
				{ date: "2026-01-11", value: 100 },
				{ date: "2026-01-06", value: 50 },
			],
			box,
			{ start: "2026-01-01", end: "2026-01-11" },
		);
		expect(g.coords.map((c) => [c.x, c.y])).toEqual([
			[10, 50],
			[110, 10],
			[60, 30],
		]);
		expect(g.d).toBe("M10,50 L110,10 L60,30");
	});

	it("begrenzt Werte und Daten außerhalb des Bereichs", () => {
		const g = lineGeometry(
			[
				{ date: "2025-12-01", value: -5 },
				{ date: "2027-01-01", value: 140 },
			],
			box,
			{ start: "2026-01-01", end: "2026-12-31" },
		);
		expect(g.coords.map((c) => [c.x, c.y])).toEqual([
			[10, 50],
			[110, 10],
		]);
	});

	it("findet den nächsten Punkt fürs Fadenkreuz", () => {
		expect(nearestIndex([{ x: 10 }, { x: 50 }, { x: 90 }], 62)).toBe(1);
		expect(nearestIndex([], 5)).toBe(-1);
	});
});
