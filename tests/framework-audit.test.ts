import { describe, expect, it } from "vitest";
import {
	auditDistance,
	frameworkAuditStates,
} from "@/lib/compliance/framework-audit";

describe("Audit-Stand je Rahmenwerk", () => {
	it("nennt den Abstand in Tagen, Wochen oder Monaten", () => {
		expect(auditDistance("2026-11-03", "2026-11-03")).toEqual({
			unit: "days",
			n: 0,
		});
		expect(auditDistance("2026-11-03", "2026-11-12")).toEqual({
			unit: "days",
			n: 9,
		});
		expect(auditDistance("2026-11-03", "2026-11-24")).toEqual({
			unit: "weeks",
			n: 3,
		});
		expect(auditDistance("2026-11-03", "2027-01-15")).toEqual({
			unit: "months",
			n: 2,
		});
		expect(auditDistance("2026-11-03", "2027-11-03")).toEqual({
			unit: "months",
			n: 12,
		});
		expect(auditDistance("2026-11-03", "2026-10-01")).toEqual({
			unit: "days",
			n: 0,
		});
	});

	it("läuft, steht an oder ist nicht geplant", () => {
		const states = frameworkAuditStates(
			["iso27001", "dora", "nis2"],
			{},
			[
				{
					frameworkIds: ["iso27001"],
					date: "2026-10-20",
					type: "certification",
					status: "in_progress",
				},
				{
					frameworkIds: ["dora"],
					date: "2026-12-01",
					type: "external",
					status: "planned",
				},
				{
					frameworkIds: ["nis2"],
					date: "2026-12-01",
					type: "external",
					status: "closed",
				},
			],
			"2026-11-03",
		);
		expect(states.get("iso27001")).toEqual({ kind: "running" });
		expect(states.get("dora")).toEqual({
			kind: "upcoming",
			date: "2026-12-01",
			unit: "weeks",
			n: 4,
		});
		expect(states.get("nis2")).toEqual({ kind: "none" });
	});

	it("nimmt den Turnus, wenn nichts eingetragen ist", () => {
		const states = frameworkAuditStates(
			["iso27001"],
			{ iso27001: { anchors: { certification: "2026-03-01" } } },
			[],
			"2026-11-03",
		);
		expect(states.get("iso27001")?.kind).toBe("upcoming");
	});
});
