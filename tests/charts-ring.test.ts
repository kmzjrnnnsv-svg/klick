import { describe, expect, it } from "vitest";
import { donutArcs, percent, ringFraction } from "@/lib/charts/ring";

describe("Ring und Donut", () => {
	it("rechnet Prozent ganzzahlig und ohne Nenner 0", () => {
		expect(percent(1, 3)).toBe(33);
		expect(percent(2, 3)).toBe(67);
		expect(percent(5, 0)).toBe(0);
		expect(percent(-1, 4)).toBe(0);
	});

	it("begrenzt den Füllstand", () => {
		expect(ringFraction(50)).toBe(0.5);
		expect(ringFraction(150)).toBe(1);
		expect(ringFraction(-3)).toBe(0);
		expect(ringFraction(3, 0)).toBe(0);
		expect(ringFraction(Number.NaN)).toBe(0);
	});

	it("verteilt die Bögen mit Lücke und lässt leere Teile weg", () => {
		const arcs = donutArcs(
			[
				{ key: "a", value: 3 },
				{ key: "b", value: 0 },
				{ key: "c", value: 1 },
			],
			0.01,
		);
		expect(arcs.map((a) => a.key)).toEqual(["a", "c"]);
		expect(arcs[0]?.start).toBe(0);
		expect(arcs[0]?.share).toBe(0.75);
		expect(arcs[0]?.length).toBeCloseTo(0.74);
		expect(arcs[1]?.start).toBe(0.75);
		expect(arcs[1]?.length).toBeCloseTo(0.24);
	});

	it("füllt mit einem Teil den ganzen Ring und hält kleine Teile sichtbar", () => {
		expect(donutArcs([{ key: "a", value: 2 }])[0]?.length).toBe(1);
		const tiny = donutArcs(
			[
				{ key: "a", value: 999 },
				{ key: "b", value: 1 },
			],
			0.01,
		);
		expect(tiny[1]?.length).toBeCloseTo(0.0005);
		expect(donutArcs([])).toEqual([]);
		expect(donutArcs([{ key: "a", value: 0 }])).toEqual([]);
	});
});
