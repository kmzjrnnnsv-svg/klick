import { describe, expect, it } from "vitest";
import {
	classifyDoraIncident,
	classifyNis2Incident,
	clockState,
	computeIncidentDeadlines,
	craReasons,
	leadRegime,
	nextIncidentCode,
} from "@/lib/compliance/incident";
import { monthsDeadline } from "@/lib/time/berlin";

const H = 3_600_000;
const aware = new Date("2026-10-07T10:00:00Z");

describe("classifyDoraIncident", () => {
	it("kritischer Dienst + böswilliger Zugriff → major", () => {
		const r = classifyDoraIncident({
			criticalServicesAffected: true,
			maliciousAccess: true,
		});
		expect(r.classification).toBe("major");
		expect(r.reasons).toContain("Böswilliger, unbefugter Zugriff");
	});
	it("kritischer Dienst + 2 Schwellen → major, 1 Schwelle → significant", () => {
		expect(
			classifyDoraIncident({
				criticalServicesAffected: true,
				downtimeHours: 3,
				dataLoss: true,
			}).classification,
		).toBe("major");
		expect(
			classifyDoraIncident({ criticalServicesAffected: true, downtimeHours: 3 })
				.classification,
		).toBe("significant");
	});
	it("ohne kritischen Dienst höchstens significant", () => {
		expect(
			classifyDoraIncident({
				clientsAffectedPct: 12,
				economicImpactEur: 200_000,
			}).classification,
		).toBe("significant");
		expect(classifyDoraIncident({}).classification).toBe("minor");
	});
	it("NIS2: eine Bedingung reicht für erheblich", () => {
		expect(classifyNis2Incident({ financialLoss: true }).classification).toBe(
			"significant",
		);
		expect(classifyNis2Incident({}).classification).toBe("minor");
	});
});

describe("computeIncidentDeadlines", () => {
	it("DORA: Erstmeldung = min(Einstufung + 4 h, Kenntnis + 24 h)", () => {
		const early = computeIncidentDeadlines("dora", {
			awareAt: aware,
			classifiedAt: new Date(aware.getTime() + 1 * H),
		});
		expect(early.initialDueAt).toEqual(new Date(aware.getTime() + 5 * H));
		const late = computeIncidentDeadlines("dora", {
			awareAt: aware,
			classifiedAt: new Date(aware.getTime() + 23 * H),
		});
		expect(late.initialDueAt).toEqual(new Date(aware.getTime() + 24 * H));
		const unclassified = computeIncidentDeadlines("dora", { awareAt: aware });
		expect(unclassified.initialDueAt).toEqual(
			new Date(aware.getTime() + 24 * H),
		);
	});

	it("DORA: Folgefristen hängen an der Abgabe, vorher projiziert", () => {
		const d = computeIncidentDeadlines("dora", {
			awareAt: aware,
			classifiedAt: new Date(aware.getTime() + 1 * H),
		});
		expect(d.projected).toBe(true);
		expect(d.intermediateDueAt).toEqual(
			new Date(aware.getTime() + (5 + 72) * H),
		);
		const reported = new Date(aware.getTime() + 3 * H);
		const d2 = computeIncidentDeadlines("dora", {
			awareAt: aware,
			classifiedAt: new Date(aware.getTime() + 1 * H),
			initialReportedAt: reported,
		});
		expect(d2.intermediateDueAt).toEqual(new Date(reported.getTime() + 72 * H));
		const intermediate = new Date(reported.getTime() + 50 * H);
		const d3 = computeIncidentDeadlines("dora", {
			awareAt: aware,
			initialReportedAt: reported,
			intermediateReportedAt: intermediate,
		});
		// ein Monat nach dem Zwischenbericht, Ende des Berliner Tages
		expect(d3.finalDueAt).toEqual(monthsDeadline(intermediate, 1));
		expect(d3.projected).toBe(false);
		expect(d3.labels).toEqual({
			initial: "Erstmeldung",
			intermediate: "Zwischenbericht",
			final: "Abschlussbericht",
		});
	});

	it("DORA-Abschlussbericht: 31.01. + 1 Monat = 28.02. (kein Überlauf in den März)", () => {
		const d = computeIncidentDeadlines("dora", {
			awareAt: new Date("2027-01-27T10:00:00Z"),
			initialReportedAt: new Date("2027-01-28T10:00:00Z"),
			intermediateReportedAt: new Date("2027-01-31T10:00:00Z"),
		});
		expect(d.finalDueAt).toEqual(new Date("2027-02-28T22:59:59.999Z"));
	});

	it("NIS2: Abschlussbericht einen Monat nach der Meldung, nicht nach Kenntnis", () => {
		const aw = new Date("2026-10-01T08:00:00Z");
		const sent = new Date("2026-10-03T08:00:00Z");
		const d = computeIncidentDeadlines("nis2", {
			awareAt: aw,
			intermediateReportedAt: sent,
		});
		expect(d.finalDueAt).toEqual(new Date("2026-11-03T22:59:59.999Z"));
		expect(d.projected).toBe(false);
		expect(computeIncidentDeadlines("nis2", { awareAt: aw }).projected).toBe(
			true,
		);
	});

	it("NIS2: 24 h / 72 h / 1 Monat ab Kenntnis", () => {
		const d = computeIncidentDeadlines("nis2", { awareAt: aware });
		expect(d.earlyWarningAt).toEqual(new Date(aware.getTime() + 24 * H));
		expect(d.intermediateDueAt).toEqual(new Date(aware.getTime() + 72 * H));
		expect(d.finalDueAt?.getMonth()).toBe((aware.getMonth() + 1) % 12);
		expect(d.labels.initial).toBe("Frühwarnung");
	});

	it("DSGVO: 72 h, keine Folgefristen", () => {
		const d = computeIncidentDeadlines("dsgvo", { awareAt: aware });
		expect(d.initialDueAt).toEqual(new Date(aware.getTime() + 72 * H));
		expect(d.intermediateDueAt).toBeNull();
		expect(d.finalDueAt).toBeNull();
	});

	it("clockState", () => {
		const due = new Date(aware.getTime() + 24 * H);
		expect(clockState(due, null, aware)).toBe("due");
		expect(clockState(due, null, new Date(due.getTime() - 1 * H))).toBe("soon");
		expect(clockState(due, null, new Date(due.getTime() + 1))).toBe("overdue");
		expect(clockState(due, new Date(), aware)).toBe("done");
		expect(clockState(null, null, aware)).toBeNull();
	});

	it("nextIncidentCode je Jahr", () => {
		expect(nextIncidentCode([], 2026)).toBe("INC-2026-001");
		expect(nextIncidentCode(["INC-2026-004", "INC-2025-009"], 2026)).toBe(
			"INC-2026-005",
		);
	});
});

describe("leadRegime", () => {
	it("strengste Uhr führt, unabhängig von der Reihenfolge", () => {
		expect(leadRegime(["dsgvo", "nis2"])).toBe("nis2");
		expect(leadRegime(["nis2", "dora"])).toBe("dora");
		expect(leadRegime(["gwg_sar"])).toBe("gwg_sar");
		expect(leadRegime([])).toBeNull();
		expect(leadRegime(["cra_vuln", "nis2"])).toBe("nis2");
		expect(leadRegime(["dsgvo", "cra_incident"])).toBe("cra_incident");
	});
});

describe("CRA-Uhren (Art. 14)", () => {
	const aware = new Date("2026-10-01T10:00:00Z");
	it("Schwachstelle: 24 h / 72 h, Abschluss 14 Tage nach Abhilfe", () => {
		const open = computeIncidentDeadlines("cra_vuln", { awareAt: aware });
		expect(open.initialDueAt.toISOString()).toBe("2026-10-02T10:00:00.000Z");
		expect(open.intermediateDueAt?.toISOString()).toBe(
			"2026-10-04T10:00:00.000Z",
		);
		expect(open.finalDueAt).toBeNull();
		const fixed = computeIncidentDeadlines("cra_vuln", {
			awareAt: aware,
			mitigationAvailableAt: new Date("2026-10-05T12:00:00Z"),
		});
		expect(fixed.finalDueAt?.toISOString()).toBe("2026-10-19T12:00:00.000Z");
	});

	it("Vorfall: Abschluss 1 Monat nach der Vorfallmeldung, sonst projiziert", () => {
		const projected = computeIncidentDeadlines("cra_incident", {
			awareAt: aware,
		});
		expect(projected.projected).toBe(true);
		expect(projected.finalDueAt?.toISOString()).toBe(
			"2026-11-04T22:59:59.999Z",
		);
		const sent = computeIncidentDeadlines("cra_incident", {
			awareAt: aware,
			intermediateReportedAt: new Date("2026-10-03T09:00:00Z"),
		});
		expect(sent.projected).toBe(false);
		expect(sent.finalDueAt?.toISOString()).toBe("2026-11-03T22:59:59.999Z");
	});

	it("craReasons nennt die erfüllten Kriterien", () => {
		expect(
			craReasons({ activelyExploited: true, maliciousCode: true }),
		).toEqual([
			"Aktiv ausgenutzte Schwachstelle",
			"Schadcode eingeschleust oder ausgeführt",
		]);
		expect(craReasons({})).toEqual([]);
	});
});
