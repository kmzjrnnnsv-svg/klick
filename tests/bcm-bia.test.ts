import { describe, expect, it } from "vitest";
import {
	type BiaDimension,
	biaCurve,
	biaIssues,
	criticalityFor,
	defaultThreshold,
	durationParts,
	emptyBia,
	normalizeBia,
	suggestTargets,
} from "@/lib/bcm/bia";
import { programmeStatus } from "@/lib/compliance/test-programme";
import { processSchema } from "@/lib/validation/governance";

const DIMS: BiaDimension[] = [
	{ key: "financial", label: "Finanziell", enabled: true },
	{ key: "customers", label: "Kunden", enabled: true },
	{ key: "image", label: "Ansehen", enabled: false },
];

const base = (impacts: Record<string, number[]>, threshold = 4) => ({
	v: 1 as const,
	steps: [4, 8, 24, 72, 168, 336],
	threshold,
	impacts,
	dataLossHours: 4,
	notes: null,
});

describe("BIA: Vorschlag aus dem Schaden über die Zeit", () => {
	it("MTPD = erste untragbare Zeitstufe, RTO = die davor", () => {
		const s = suggestTargets(
			base({
				financial: [1, 2, 3, 4, 5, 5],
				customers: [1, 1, 2, 3, 4, 5],
			}),
			DIMS,
		);
		expect(s.mtpdHours).toBe(72);
		expect(s.rtoHours).toBe(24);
		expect(s.rpoHours).toBe(4);
		expect(s.decisive).toEqual(["financial"]);
		expect(s.criticality).toBe("important");
	});

	it("schon die erste Stufe untragbar: RTO = Hälfte", () => {
		const s = suggestTargets(base({ financial: [5, 5, 5, 5, 5, 5] }), DIMS);
		expect(s.mtpdHours).toBe(4);
		expect(s.rtoHours).toBe(2);
		expect(s.criticality).toBe("critical");
	});

	it("nie untragbar: kein Vorschlag, normal", () => {
		const s = suggestTargets(base({ financial: [1, 1, 2, 2, 3, 3] }), DIMS);
		expect(s.mtpdHours).toBeNull();
		expect(s.rtoHours).toBeNull();
		expect(s.criticality).toBe("standard");
	});

	it("ausgeschaltete Schadensarten zählen nicht", () => {
		const curve = biaCurve(
			base({ financial: [1, 1, 1, 1, 1, 1], image: [5, 5, 5, 5, 5, 5] }),
			DIMS,
		);
		expect(curve.every((p) => p.level === 1)).toBe(true);
	});

	it("Schwelle und Kritikalität", () => {
		expect(defaultThreshold(5)).toBe(4);
		expect(defaultThreshold(4)).toBe(3);
		expect(criticalityFor(24)).toBe("critical");
		expect(criticalityFor(168)).toBe("important");
		expect(criticalityFor(336)).toBe("standard");
	});

	it("leere BIA nur mit aktiven Schadensarten", () => {
		const b = emptyBia(DIMS, 5);
		expect(Object.keys(b.impacts)).toEqual(["financial", "customers"]);
		expect(b.threshold).toBe(4);
	});

	it("Dauer lesbar", () => {
		expect(durationParts(4)).toEqual({ unit: "hours", count: 4 });
		expect(durationParts(72)).toEqual({ unit: "days", count: 3 });
		expect(durationParts(336)).toEqual({ unit: "weeks", count: 2 });
		expect(durationParts(36)).toEqual({ unit: "hours", count: 36 });
	});
});

describe("BIA: Eingaben bereinigen", () => {
	it("sortiert Zeitstufen, wirft Doppelte weg, ordnet Werte mit um", () => {
		const n = normalizeBia(
			{
				v: 1,
				steps: [24, 4, 24, 9000],
				threshold: 9,
				impacts: { financial: [3, 1, 2, 5], unknown: [5, 5, 5, 5] },
				dataLossHours: -3,
				notes: "  ",
			},
			DIMS,
			5,
		);
		expect(n.steps).toEqual([4, 24]);
		expect(n.impacts.financial).toEqual([1, 3]);
		expect(n.impacts.customers).toEqual([0, 0]);
		expect("unknown" in n.impacts).toBe(false);
		expect(n.threshold).toBe(5);
		expect(n.dataLossHours).toBe(0);
		expect(n.notes).toBeNull();
	});
});

describe("BIA: Hinweise am Prozess", () => {
	const bia = {
		...base({ financial: [1, 2, 3, 2, 4, 5] }),
		assessedAt: "2026-01-01T00:00:00.000Z",
		assessedBy: null,
	};
	it("RTO über MTPD, sinkender Schaden, veraltet", () => {
		const issues = biaIssues(
			{
				criticality: "critical",
				rtoHours: 48,
				rpoHours: 4,
				mtpdHours: 24,
				bia,
			},
			new Date("2027-03-01T00:00:00Z"),
		);
		expect(issues).toEqual(["rto_over_mtpd", "stale", "decreasing"]);
	});
	it("kritisch ohne BIA und ohne Ziele", () => {
		expect(
			biaIssues({
				criticality: "important",
				rtoHours: null,
				rpoHours: null,
				mtpdHours: null,
				bia: null,
			}),
		).toEqual(["critical_without_targets", "not_assessed"]);
	});
	it("normaler Prozess ohne BIA: kein Hinweis", () => {
		expect(
			biaIssues({
				criticality: "standard",
				rtoHours: null,
				rpoHours: null,
				mtpdHours: null,
				bia: null,
			}),
		).toEqual([]);
	});
});

describe("Prozess-Formular: RTO ≤ MTPD", () => {
	it("lehnt RTO über MTPD ab", () => {
		const r = processSchema.safeParse({
			name: "Zahlungsverkehr",
			ownerUserId: null,
			rtoHours: 48,
			mtpdHours: 24,
		});
		expect(r.success).toBe(false);
	});
	it("nimmt gleiche Werte an", () => {
		const r = processSchema.safeParse({
			name: "Zahlungsverkehr",
			ownerUserId: null,
			rtoHours: 24,
			mtpdHours: 24,
		});
		expect(r.success).toBe(true);
	});
});

describe("Testprogramm: durchgeführte Übung schließt die Lücke", () => {
	it("geplante Zeile mit Prozess und Ergebnis zählt", () => {
		const crit = [{ id: "p1", code: "P-01", name: "Zahlungen" }];
		const planned = {
			id: "t1",
			method: "bcm_exercise",
			plannedAt: "2026-05-01",
			testedAt: null,
			result: null,
			processId: "p1",
			nextTestAt: null,
		};
		expect(programmeStatus(2026, [planned], crit).bcmGaps).toHaveLength(1);
		const done = {
			...planned,
			testedAt: new Date("2026-05-02"),
			result: "pass",
		};
		expect(programmeStatus(2026, [done], crit).bcmGaps).toHaveLength(0);
	});
});
