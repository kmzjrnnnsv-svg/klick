import { describe, expect, it } from "vitest";
import {
	type RiskProposalInput,
	riskProposals,
} from "@/lib/compliance/risk-proposals";

const now = new Date("2026-10-17T08:00:00Z");
const base: RiskProposalInput = {
	now,
	assets: [],
	providers: [],
	incidents: [],
	gaps: [],
	moreGaps: 0,
	findings: [],
	nonconformities: [],
	covered: new Set(),
	dismissed: new Set(),
};

describe("riskProposals", () => {
	it("schlägt EOL-Assets, rote Bewertungen, schwere Vorfälle und überfällige Befunde vor", () => {
		const r = riskProposals({
			...base,
			assets: [
				{
					id: "a1",
					name: "Altserver",
					state: "expired",
					reasons: ["Supportende"],
				},
				{ id: "a2", name: "Laptop", state: "soon", reasons: [] },
			],
			providers: [
				{
					id: "p1",
					name: "Cloud AG",
					criticality: "critical",
					traffic: "red",
					ratingId: "r1",
					nextAssessmentAt: null,
					status: "active",
				},
				{
					id: "p2",
					name: "Druckerei",
					criticality: "standard",
					traffic: null,
					ratingId: null,
					nextAssessmentAt: null,
					status: "active",
				},
			],
			incidents: [
				{ id: "i1", code: "V-1", title: "Ausfall", classification: "major" },
				{ id: "i2", code: "V-2", title: "Kleinkram", classification: "minor" },
			],
			findings: [
				{
					id: "f1",
					title: "SQLi",
					severity: "critical",
					status: "open",
					dueAt: new Date("2026-10-01T00:00:00Z"),
				},
				{
					id: "f2",
					title: "Header",
					severity: "high",
					status: "open",
					dueAt: new Date("2026-11-01T00:00:00Z"),
				},
			],
		});
		expect(r.map((p) => p.key)).toEqual([
			"security_finding:f1",
			"incident:i1",
			"provider_rating:r1",
			"asset:a1",
		]);
	});

	it("lässt Erfasstes und Abgelehntes weg", () => {
		const r = riskProposals({
			...base,
			nonconformities: [
				{ id: "n1", code: "A-1", title: "Doku fehlt" },
				{ id: "n2", code: "A-2", title: "Test fehlt" },
			],
			gaps: [{ id: "q1", key: "dora:Art. 9", label: "DORA Art. 9" }],
			covered: new Set(["nonconformity:n1"]),
			dismissed: new Set(["requirement:q1"]),
		});
		expect(r.map((p) => p.key)).toEqual(["nonconformity:n2"]);
	});

	it("kritischer Dienstleister ohne Bewertung wird vorgeschlagen", () => {
		const r = riskProposals({
			...base,
			providers: [
				{
					id: "p3",
					name: "Kernbank",
					criticality: "critical",
					traffic: null,
					ratingId: null,
					nextAssessmentAt: "2026-09-01",
					status: "active",
				},
			],
		});
		expect(r[0]).toMatchObject({
			key: "provider:p3",
			reason: "kritisch, Bewertung überfällig",
		});
	});
});
