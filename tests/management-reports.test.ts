import { describe, expect, it } from "vitest";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import {
	applicableReportKinds,
	REPORT_KIND_BY_KEY,
	REPORT_KINDS,
	reportSchedule,
	suggestPeriod,
} from "@/lib/compliance/catalog/management-reports";
import { MANAGEMENT_REVIEW_INPUTS } from "@/lib/compliance/catalog/management-review-inputs";
import {
	type DigestData,
	reviewDigest,
} from "@/lib/compliance/management-review-digest";
import { buildGlBericht } from "@/lib/evidence-studio/kinds/gl-bericht";

describe("Berichtsarten", () => {
	it("Abschnitte und Controls existieren", () => {
		const keys = new Set(MANAGEMENT_REVIEW_INPUTS.map((i) => i.key));
		for (const k of REPORT_KINDS) {
			for (const s of k.sections)
				expect(keys.has(s), `${k.kind} ${s}`).toBe(true);
			expect(CONTROL_BY_CODE.has(k.control), k.control).toBe(true);
		}
	});

	it("nach Rahmenwerken: GwG bringt den GWB-Bericht, „Sonstige“ nie fällig", () => {
		const kinds = applicableReportKinds(["gwg"]).map((k) => k.kind);
		expect(kinds).toEqual(["aml"]);
		expect(
			applicableReportKinds(["iso27001", "dora"]).map((k) => k.kind),
		).toEqual(["isms", "ict_risk", "outsourcing"]);
	});

	it("fällig ohne Bericht, aktuell nach Bericht, Entwurf zählt als in Arbeit", () => {
		const aml = REPORT_KIND_BY_KEY.get("aml");
		if (!aml) throw new Error("aml fehlt");
		expect(reportSchedule([aml], [], "2026-10-23")[0]).toMatchObject({
			state: "due",
			lastPeriodTo: null,
		});
		const done = reportSchedule(
			[aml],
			[{ kind: "aml", status: "submitted", periodTo: "2026-06-30" }],
			"2026-10-23",
		)[0];
		expect(done).toMatchObject({ state: "ok", nextDue: "2027-06-30" });
		expect(
			reportSchedule(
				[aml],
				[{ kind: "aml", status: "submitted", periodTo: "2025-06-30" }],
				"2026-10-23",
			)[0]?.state,
		).toBe("due");
		expect(
			reportSchedule(
				[aml],
				[{ kind: "aml", status: "draft", periodTo: "2026-10-23" }],
				"2026-10-23",
			)[0]?.state,
		).toBe("draft");
	});

	it("Zeitraum schließt an den letzten an, sonst zwölf Monate", () => {
		expect(suggestPeriod("2026-06-30", "2026-10-23")).toEqual({
			from: "2026-06-30",
			to: "2026-10-23",
		});
		expect(suggestPeriod(null, "2026-10-23")).toEqual({
			from: "2025-10-23",
			to: "2026-10-23",
		});
	});
});

describe("Geldwäsche-Abschnitt der Zusammenfassung", () => {
	const aml = MANAGEMENT_REVIEW_INPUTS.filter((i) => i.key === "aml_report");
	const base = {
		trainings: { assigned: 4, done: 3, overdue: 1 },
	} as unknown as DigestData;
	it("ohne Daten kein Abschnitt", () => {
		const d = reviewDigest(base, {
			from: "2025-10-23",
			to: "2026-10-23",
			inputs: aml,
			now: new Date("2026-10-23T10:00:00Z"),
		});
		expect(d.sections).toEqual([]);
	});
	it("Risikoanalyse, Fälle, Regeln — nur Zähler", () => {
		const d = reviewDigest(
			{
				...base,
				aml: {
					asOf: "2026-10-23",
					analysis: {
						approvedAt: "2026-02-01T09:00:00.000Z",
						nextReviewAt: "2026-09-30",
					},
					casesInPeriod: 3,
					reportedInPeriod: 1,
					inReview: 1,
					rulesActive: 0,
				},
			},
			{
				from: "2025-10-23",
				to: "2026-10-23",
				inputs: aml,
				now: new Date("2026-10-23T10:00:00Z"),
			},
		);
		const facts = Object.fromEntries(
			(d.sections[0]?.facts ?? []).map((f) => [f.label, f]),
		);
		expect(facts.Risikoanalyse?.value).toBe("freigegeben am 01.02.2026");
		expect(facts["Überprüfung der Risikoanalyse"]?.tone).toBe("warn");
		expect(facts["Verdachtsfälle im Zeitraum"]?.value).toBe("3");
		expect(facts["aktive Monitoring-Regeln"]?.tone).toBe("warn");
		expect(d.sections[0]?.items).toEqual([]);
	});
});

describe("Bericht an die GL als Nachweis", () => {
	it("Rahmen, Einschätzung, Kennzahlen, Maßnahmen", () => {
		const doc = buildGlBericht({
			kind: "aml",
			title: "Jahresbericht GWB 2026",
			periodFrom: "2025-10-01",
			periodTo: "2026-09-30",
			authorFunction: "aml_officer",
			author: "Gwen Weber",
			submittedAt: "2026-10-23",
			summary: "Risikolage unverändert.",
			measures: null,
			sections: [
				{
					title: "Bericht der Geldwäschebeauftragten",
					facts: [["Verdachtsfälle im Zeitraum", "3"]],
					items: [],
				},
			],
		});
		const text = JSON.stringify(doc.blocks);
		expect(doc.subtitle).toBe("Bericht der Geldwäschebeauftragten");
		expect(text).toContain("01.10.2025 – 30.09.2026");
		expect(text).toContain("Gwen Weber (Geldwäschebeauftragte:r (GWB))");
		expect(text).toContain("Verdachtsfälle im Zeitraum");
		expect(text).toContain("Keine Maßnahmen vorgeschlagen.");
	});
});
