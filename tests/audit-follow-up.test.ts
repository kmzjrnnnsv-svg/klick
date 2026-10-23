import { describe, expect, it } from "vitest";
import {
	effectiveRegime,
	followUpDue,
	upcomingAudits,
} from "@/lib/compliance/audit-follow-up";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	AUDIT_REGIMES,
	regimeFor,
} from "@/lib/compliance/catalog/audit-regimes";

const now = new Date("2026-10-23T10:00:00Z");

describe("Nacharbeitsfristen je Rahmenwerk", () => {
	it("Regime gehören zu bestehenden Rahmenwerken", () => {
		for (const r of AUDIT_REGIMES)
			expect(FRAMEWORK_BY_SLUG.has(r.framework), r.framework).toBe(true);
	});

	it("ISO: Hauptabweichung Plan 30 / Umsetzung 90 Tage", () => {
		const d = followUpDue({ severity: "major", frameworks: ["iso27001"], now });
		expect(d.cls).toBe("major");
		expect(d.perFramework[0]).toEqual({
			framework: "iso27001",
			classLabel: "Hauptabweichung",
			planDue: "2026-11-22",
			closeDue: "2027-01-21",
		});
		// kritisch zählt als Hauptabweichung
		expect(
			followUpDue({ severity: "critical", frameworks: ["iso27001"], now }).cls,
		).toBe("major");
	});

	it("Nebenabweichung bis zum nächsten Audit, wenn das früher ist", () => {
		const d = followUpDue({
			severity: "minor",
			frameworks: ["iso27001"],
			nextAudit: { iso27001: "2027-03-01" },
			now,
		});
		expect(d.perFramework[0]?.closeDue).toBe("2027-03-01");
		expect(d.perFramework[0]?.classLabel).toBe("Nebenabweichung");
	});

	it("mehrere Rahmenwerke: jedes behält seine Frist, geführt wird die früheste", () => {
		const d = followUpDue({
			severity: "minor",
			frameworks: ["iso27001", "dora"],
			now,
		});
		expect(d.perFramework.map((p) => [p.framework, p.planDue])).toEqual([
			["iso27001", "2027-01-21"],
			["dora", "2026-12-22"],
		]);
		expect(d.earliest.planDue).toBe("2026-12-22");
		expect(d.perFramework[1]?.classLabel).toBe("Feststellung");
	});

	it("eigene Festlegung der Organisation geht vor, ohne Regime gelten Standardfristen", () => {
		const d = followUpDue({
			severity: "major",
			frameworks: ["iso27001"],
			settings: {
				iso27001: { classes: { major: { planDays: 14, closeDays: 60 } } },
			},
			now,
		});
		expect(d.perFramework[0]?.planDue).toBe("2026-11-06");
		expect(d.perFramework[0]?.closeDue).toBe("2026-12-22");
		const fallback = followUpDue({
			severity: "major",
			frameworks: ["dsgvo"],
			now,
		});
		expect(fallback.perFramework[0]).toMatchObject({
			classLabel: "Hauptabweichung",
			planDue: "2026-11-22",
		});
		expect(regimeFor("dsgvo").label).toBe("Internes Audit");
		const obs = followUpDue({
			severity: "observation",
			frameworks: ["iso27001"],
			now,
		});
		expect(obs.earliest).toEqual({ planDue: null, closeDue: null });
	});
});

describe("Audittermine je Rahmenwerk", () => {
	it("ISO: Überwachung jährlich ab Zertifikat, im dritten Jahr Rezertifizierung", () => {
		const { planned, missingAnchors } = upcomingAudits(
			"iso27001",
			{ iso27001: { anchors: { certification: "2026-01-15" } } },
			"2026-10-23",
		);
		expect(planned.map((p) => [p.kind, p.date])).toEqual([
			["surveillance", "2027-01-15"],
			["surveillance", "2028-01-15"],
			["recertification", "2029-01-15"],
		]);
		expect(missingAnchors).toEqual(["internal"]);
	});

	it("eigener Rhythmus je Rahmenwerk", () => {
		const r = effectiveRegime("dora", {
			dora: { cycles: [{ kind: "internal", everyMonths: 6 }] },
		});
		expect(r.cycles.find((c) => c.kind === "internal")?.everyMonths).toBe(6);
		const { planned } = upcomingAudits(
			"dora",
			{
				dora: {
					cycles: [{ kind: "internal", everyMonths: 6 }],
					anchors: { internal: "2026-09-01" },
				},
			},
			"2026-10-23",
			12,
		);
		expect(planned.map((p) => p.date)).toEqual(["2027-03-01", "2027-09-01"]);
	});
});
