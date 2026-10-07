import { describe, expect, it } from "vitest";
import {
	addBusinessDays,
	aggregateSuspicious,
	listRelevantChanges,
	nextSuspiciousRef,
	overallAmlRisk,
	parseJurisdictionCsv,
	sarHoldUntil,
} from "@/lib/compliance/aml";

describe("aml helpers", () => {
	it("laufende Nummern je Art und Jahr", () => {
		const now = new Date("2026-10-07T10:00:00Z");
		expect(nextSuspiciousRef([], "gwg_sar", now)).toBe("VM-2026-001");
		expect(
			nextSuspiciousRef(
				["VM-2026-001", "VM-2026-007", "STOR-2026-002"],
				"gwg_sar",
				now,
			),
		).toBe("VM-2026-008");
		expect(nextSuspiciousRef(["STOR-2026-002"], "micar_stor", now)).toBe(
			"STOR-2026-003",
		);
		expect(nextSuspiciousRef(["VM-2025-040"], "gwg_sar", now)).toBe(
			"VM-2026-001",
		);
	});

	it("§ 46 GwG: drei Werktage nach Meldung, Wochenende übersprungen", () => {
		// Donnerstag 08.10.2026 → Di 13.10.2026
		const thu = new Date("2026-10-08T15:00:00Z");
		expect(sarHoldUntil(thu).toISOString().slice(0, 10)).toBe("2026-10-13");
		// Freitag → Mittwoch
		expect(
			addBusinessDays(new Date("2026-10-09T09:00:00Z"), 3).getUTCDay(),
		).toBe(3);
	});

	it("Kennzahlen für den GWB-Jahresbericht", () => {
		const now = new Date("2026-10-07T00:00:00Z");
		const s = aggregateSuspicious(
			[
				{
					kind: "gwg_sar",
					status: "review",
					detectedAt: new Date("2026-10-01T00:00:00Z"),
					decidedAt: null,
					reportedAt: null,
					holdUntil: null,
				},
				{
					kind: "gwg_sar",
					status: "reported",
					detectedAt: new Date("2026-10-01T00:00:00Z"),
					decidedAt: new Date("2026-10-05T00:00:00Z"),
					reportedAt: new Date("2026-10-05T00:00:00Z"),
					holdUntil: new Date("2026-10-08T00:00:00Z"),
				},
				{
					kind: "micar_stor",
					status: "dismissed",
					detectedAt: new Date("2026-09-01T00:00:00Z"),
					decidedAt: new Date("2026-09-03T00:00:00Z"),
					reportedAt: null,
					holdUntil: null,
				},
				{
					kind: "gwg_sar",
					status: "reported",
					detectedAt: new Date("2025-03-01T00:00:00Z"),
					decidedAt: new Date("2025-03-02T00:00:00Z"),
					reportedAt: new Date("2025-03-02T00:00:00Z"),
					holdUntil: new Date("2025-03-05T00:00:00Z"),
				},
			],
			now,
		);
		expect(s.open).toBe(1);
		expect(s.onHold).toBe(1);
		expect(s.reportedThisYear).toBe(1);
		expect(s.dismissedThisYear).toBe(1);
		expect(s.byKind).toEqual({ gwg_sar: 3, micar_stor: 1 });
		expect(s.avgDecisionDays).toBe(2.3);
	});

	it("CSV-Import der Länderliste: Kopfzeile, Trenner, Validierung", () => {
		const r = parseJurisdictionCsv(
			[
				"iso2;name;euHighRisk;fatfStatus;euSanctions;usSanctions;orgStance;corridorStatus;legalNotes",
				"ke;Kenia;ja;grey;nein;nein;enhanced_dd;evaluating;FATF 02/2024",
				"IR;Iran;1;black;1;1;blocked;none;",
				"XXX;Falsch;;;;;;;",
				"DE;Deutschland;;none;;;allowed;active;",
				"DE;Doppelt;;none;;;allowed;active;",
				"BR;Brasilien;;none;;;foo;none;",
			].join("\n"),
		);
		expect(r.rows.map((x) => x.iso2)).toEqual(["KE", "IR", "DE"]);
		expect(r.rows[0]).toMatchObject({
			euHighRisk: true,
			fatfStatus: "grey",
			orgStance: "enhanced_dd",
			corridorStatus: "evaluating",
			legalNotes: "FATF 02/2024",
		});
		expect(r.rows[1]?.euSanctions).toBe(true);
		expect(r.errors.length).toBe(3);
		expect(parseJurisdictionCsv("").errors).toEqual(["leer"]);
		expect(parseJurisdictionCsv("a,b\n1,2").errors[0]).toMatch(/iso2/);
	});

	it("Listenänderung erkennen → Aufgabe an GWB", () => {
		const before = {
			euHighRisk: false,
			fatfStatus: "none" as const,
			euSanctions: false,
			usSanctions: false,
		};
		expect(listRelevantChanges(null, before)).toEqual([]);
		expect(listRelevantChanges(before, before)).toEqual([]);
		expect(
			listRelevantChanges(before, {
				...before,
				euHighRisk: true,
				fatfStatus: "grey",
			}),
		).toHaveLength(2);
	});

	it("Gesamtrisiko aus Dimensionen", () => {
		const base = { factors: "", score: 2 };
		expect(
			overallAmlRisk({
				customer: base,
				product: base,
				country: base,
				channel: base,
			}),
		).toBe("low");
		expect(
			overallAmlRisk({
				customer: base,
				product: base,
				country: { ...base, score: 4 },
				channel: base,
			}),
		).toBe("medium");
		expect(
			overallAmlRisk({
				customer: base,
				product: base,
				country: { ...base, score: 5 },
				channel: base,
			}),
		).toBe("high");
	});
});
