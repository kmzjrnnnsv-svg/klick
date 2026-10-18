import { describe, expect, it } from "vitest";
import {
	type IndicatorData,
	SOURCED_TEMPLATES,
	suggestMeasurement,
} from "@/lib/compliance/indicator-sources";
import { INDICATOR_TEMPLATES } from "@/lib/compliance/indicators";

const empty: IndicatorData = {
	trainings: [],
	members: [],
	findings: [],
	accessReviews: [],
};
const NOW = new Date("2026-10-18T10:00:00Z");

describe("suggestMeasurement", () => {
	it("jede Quelle gehört zu einer Vorlage", () => {
		for (const k of SOURCED_TEMPLATES)
			expect(
				INDICATOR_TEMPLATES.some((t) => t.key === k),
				k,
			).toBe(true);
	});

	it("ohne Vorlage oder ohne Datengrundlage kein Vorschlag", () => {
		expect(suggestMeasurement(null, empty, NOW)).toBeNull();
		expect(suggestMeasurement("phishing_click_rate", empty, NOW)).toBeNull();
		expect(suggestMeasurement("training_rate", empty, NOW)).toBeNull();
		expect(suggestMeasurement("mfa_privileged", empty, NOW)).toBeNull();
	});

	it("Schulungsquote: erledigt gegen überfällig, fällige zählen nicht", () => {
		expect(
			suggestMeasurement(
				"training_rate",
				{
					...empty,
					trainings: [
						{ state: "done" },
						{ state: "done" },
						{ state: "done" },
						{ state: "overdue" },
						{ state: "due" },
						{ state: "planned" },
					],
				},
				NOW,
			),
		).toEqual({ value: 75, basis: { key: "training", done: 3, total: 4 } });
	});

	it("MFA-Quote nur für privilegierte Konten", () => {
		expect(
			suggestMeasurement(
				"mfa_privileged",
				{
					...empty,
					members: [
						{ role: "owner", mfa: true },
						{ role: "editor", mfa: false },
						{ role: "editor", mfa: true },
						{ role: "viewer", mfa: false },
					],
				},
				NOW,
			),
		).toEqual({
			value: 66.7,
			basis: { key: "mfa", withMfa: 2, total: 3 },
		});
	});

	it("kritische Befunde über Frist: nur offen, kritisch, Frist vorbei", () => {
		const past = new Date("2026-10-01T00:00:00Z");
		const future = new Date("2026-11-01T00:00:00Z");
		expect(
			suggestMeasurement(
				"unpatched_critical",
				{
					...empty,
					findings: [
						{ severity: "critical", status: "open", dueAt: past },
						{ severity: "critical", status: "in_progress", dueAt: past },
						{ severity: "critical", status: "resolved", dueAt: past },
						{ severity: "critical", status: "open", dueAt: future },
						{ severity: "high", status: "open", dueAt: past },
						{ severity: "critical", status: "accepted", dueAt: past },
					],
				},
				NOW,
			),
		).toEqual({ value: 2, basis: { key: "findings", n: 2 } });
	});

	it("Access-Reviews: abgeschlossene Quartale der letzten zwölf Monate", () => {
		// heute Q4/2026 → zählen Q4/2025 … Q3/2026
		expect(
			suggestMeasurement(
				"access_reviews_on_time",
				{
					...empty,
					accessReviews: [
						{ testedAt: new Date("2025-11-10T00:00:00Z") }, // Q4/2025
						{ testedAt: new Date("2026-02-01T00:00:00Z") }, // Q1/2026
						{ testedAt: new Date("2026-03-01T00:00:00Z") }, // Q1 doppelt
						{ testedAt: new Date("2026-10-01T00:00:00Z") }, // laufendes Q
						{ testedAt: new Date("2025-08-01T00:00:00Z") }, // zu alt
					],
				},
				NOW,
			),
		).toEqual({ value: 50, basis: { key: "accessReviews", quarters: 2 } });
	});
});
