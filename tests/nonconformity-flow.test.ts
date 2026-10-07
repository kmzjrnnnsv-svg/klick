import { describe, expect, it } from "vitest";
import {
	capaState,
	nextNonconformityCode,
	nonconformityFromFinding,
	nonconformityFromIncident,
	nonconformityFromTest,
} from "@/lib/compliance/nonconformity";

const now = new Date("2026-10-07T12:00:00Z");

describe("Abweichung aus Quellen", () => {
	it("schwerwiegender Vorfall erzeugt Lessons-Learned-Abweichung mit 30/90-Tage-Fristen", () => {
		const d = nonconformityFromIncident(
			{
				id: "i1",
				code: "INC-2026-003",
				title: "Ausfall Zahlungs-API",
				rootCause: "Fehlkonfiguration Load-Balancer",
				ownerUserId: "im",
				classification: "major",
			},
			now,
		);
		expect(d).not.toBeNull();
		expect(d?.source).toBe("incident");
		expect(d?.rootCause).toBe("Fehlkonfiguration Load-Balancer");
		expect(d?.dueAt).toBe("2026-11-06");
		expect(d?.effectivenessCheckAt).toBe("2027-01-05");
	});
	it("kein major → keine automatische Abweichung", () => {
		expect(
			nonconformityFromIncident(
				{
					id: "i2",
					code: "INC-2026-004",
					title: "x",
					rootCause: null,
					ownerUserId: null,
					classification: "minor",
				},
				now,
			),
		).toBeNull();
	});
	it("nur fail-Tests erzeugen eine Abweichung", () => {
		const base = {
			id: "t1",
			controlCode: "CC-IAM-01",
			controlTitle: "Zugriffssteuerung",
			method: "inspection",
			notes: "3 verwaiste Admin-Konten",
			ownerUserId: "o",
		};
		expect(nonconformityFromTest({ ...base, result: "pass" }, now)).toBeNull();
		const d = nonconformityFromTest({ ...base, result: "fail" }, now);
		expect(d?.source).toBe("control_test");
		expect(d?.title).toContain("CC-IAM-01");
		expect(d?.description).toContain("verwaiste");
	});
	it("kritische Findings bekommen 14 Tage, sonst 30", () => {
		expect(
			nonconformityFromFinding(
				{
					id: "f",
					title: "x",
					description: null,
					severity: "critical",
					ownerUserId: null,
				},
				now,
			).dueAt,
		).toBe("2026-10-21");
		expect(
			nonconformityFromFinding(
				{
					id: "f",
					title: "x",
					description: null,
					severity: "minor",
					ownerUserId: null,
				},
				now,
			).dueAt,
		).toBe("2026-11-06");
	});
});

describe("capaState / Codes", () => {
	it("überfällig, Wirksamkeitsprüfung fällig, Abschluss nur bei „wirksam“", () => {
		expect(
			capaState(
				{
					status: "in_progress",
					dueAt: "2026-09-01",
					effectivenessCheckAt: "2026-10-01",
					effectivenessResult: null,
				},
				now,
			),
		).toEqual({ overdue: true, effectivenessDue: true, canClose: false });
		expect(
			capaState(
				{
					status: "verified",
					dueAt: "2026-09-01",
					effectivenessCheckAt: "2026-10-01",
					effectivenessResult: "effective",
				},
				now,
			),
		).toEqual({ overdue: false, effectivenessDue: false, canClose: true });
	});
	it("NC-Codes laufen je Jahr fort", () => {
		expect(nextNonconformityCode(["NC-2026-001", "NC-2026-002"], now)).toBe(
			"NC-2026-003",
		);
		expect(nextNonconformityCode(["NC-2025-009"], now)).toBe("NC-2026-001");
	});
});
