import { describe, expect, it } from "vitest";
import { MANAGEMENT_REVIEW_INPUTS } from "@/lib/compliance/catalog/management-review-inputs";
import {
	asDigest,
	type DigestData,
	digestMarkdown,
	digestPeriod,
	reviewDigest,
} from "@/lib/compliance/management-review-digest";

const data: DigestData = {
	previous: {
		resolutions: [
			{ number: "B-2026-002", subject: "Ziel freigeben", date: "2026-10-01" },
		],
		tasksOpen: 2,
		tasksDone: 3,
		tasksOverdue: 1,
		decisionsOpen: [
			{ code: "ME-2026-02", question: "Wie weiter?", dueAt: "2026-11-01" },
		],
		decisionsDecided: 1,
	},
	context: {
		changedIssues: [{ title: "Neue Partnerbank", scope: "external" }],
		regulatory: [
			{
				date: "2027-07-10",
				title: "AMLR gilt",
				legalBasis: "VO (EU) 2024/1624",
			},
		],
	},
	nonconformities: {
		open: 3,
		overdue: 1,
		closedInPeriod: 2,
		newInPeriod: 4,
		ineffective: 0,
		items: [
			{ id: "n1", code: "NC-001", title: "Backup fehlt", dueAt: "2026-09-01" },
		],
	},
	objectives: [
		{
			title: "Schulungsquote",
			indicatorType: "kpi",
			state: "ok",
			latest: 96,
			unit: "%",
		},
		{
			title: "Admin-Fehlversuche",
			indicatorType: "kri",
			state: "alert",
			latest: 30,
			unit: null,
		},
	],
	objectivesProposed: 1,
	audits: {
		performed: [
			{ id: "a1", title: "Internes Audit ISMS", performedAt: "2026-06-15" },
		],
		findingsNew: 5,
		findingsOpen: { critical: 0, major: 1, minor: 2, observation: 1 },
	},
	feedback: {
		complaints: 2,
		complaintsOpen: 1,
		dsr: 3,
		dsrOverdue: 0,
		regulatorContacts: 1,
	},
	risks: {
		total: 10,
		zones: { acceptable: 5, tolerable: 4, unacceptable: 1 },
		aboveAppetite: [{ id: "r1", code: "R-001", title: "Altserver" }],
		acceptedInPeriod: 1,
		treatmentsOpen: 4,
		treatmentsOverdue: 1,
		treatmentsDone: 6,
		proposals: 3,
	},
	incidents: {
		total: 2,
		major: 1,
		reported: 1,
		items: [
			{
				id: "i1",
				code: "INC-001",
				title: "Ausfall",
				classification: "schwerwiegend",
			},
		],
	},
	security: { openCritical: 1, openHigh: 2, overdue: 1 },
	providers: {
		total: 8,
		critical: 2,
		red: 1,
		yellow: 1,
		overdueAssessments: 1,
		items: [{ id: "p1", name: "Cloud AG", note: "Bewertung rot" }],
	},
	trainings: { assigned: 20, done: 18, overdue: 2 },
	obligations: { done: 5, overdue: 0 },
	readiness: [{ framework: "iso27001", score: 72 }],
};

describe("reviewDigest", () => {
	const d = reviewDigest(data, {
		from: "2025-10-17",
		to: "2026-10-17",
		inputs: MANAGEMENT_REVIEW_INPUTS.filter((i) => !i.frameworks),
		now: new Date("2026-10-17T10:00:00Z"),
		frameworkName: (s) => (s === "iso27001" ? "ISO 27001" : s),
	});
	const sec = (k: string) => d.sections.find((s) => s.key === k);

	it("je anwendbarem Input ein Abschnitt, ohne Daten-Abschnitt keiner", () => {
		expect(sec("objectives")).toBeTruthy();
		expect(sec("third_parties")).toBeUndefined();
		expect(sec("aml_report")).toBeUndefined();
	});
	it("Ziele mit Ampel und Alarm", () => {
		const s = sec("objectives");
		expect(s?.facts.find((f) => f.label === "Alarm")).toMatchObject({
			value: "1",
			tone: "alert",
		});
		expect(s?.items[1]?.note).toBe("Alarm · 30");
	});
	it("Risiken nach Zone, über Appetit als Einträge", () => {
		const s = sec("risk_assessment");
		expect(s?.facts[1]).toMatchObject({ value: "5 / 4 / 1", tone: "alert" });
		expect(s?.items[0]).toMatchObject({
			title: "R-001 Altserver",
			href: "/risiken/r1",
		});
	});
	it("Prüfungsreife je Rahmenwerk mit Namen", () => {
		expect(sec("monitoring_results")?.facts[0]).toMatchObject({
			label: "Prüfungsreife ISO 27001",
			value: "72 %",
			tone: "warn",
		});
	});
	it("offene Managementanfragen vor Beschlüssen", () => {
		expect(sec("previous_actions")?.items[0]?.title).toBe(
			"ME-2026-02 Wie weiter?",
		);
	});
	it("Markdown mit Tabelle und Markierung", () => {
		const md = digestMarkdown(d, {
			orgName: "Muster GmbH",
			heldAt: "2026-10-20",
		});
		expect(md).toContain("**Zeitraum:** 17.10.2025 – 17.10.2026");
		expect(md).toContain("| Alarm | 1 ✖ |");
		expect(md).toContain("## Erreichung der Informationssicherheitsziele");
	});
	it("Markdown entschärft Backslash vor Pipe", () => {
		const md = digestMarkdown(
			{
				...d,
				sections: [
					{
						key: "x",
						title: "T",
						facts: [{ label: "a\\|b", value: "1", tone: "ok" }],
						items: [{ title: "c|d\nfolgt" }],
					},
				],
			},
			{ orgName: "Muster | GmbH" },
		);
		expect(md).toContain("| a\\\\\\|b | 1 |");
		expect(md).toContain("- c\\|d folgt");
		expect(md).toContain("**Organisation:** Muster \\| GmbH");
	});
	it("Schnappschuss wird erkannt", () => {
		expect(asDigest(JSON.parse(JSON.stringify(d)))?.sections.length).toBe(
			d.sections.length,
		);
		expect(asDigest({ foo: 1 })).toBeNull();
	});
});

describe("digestPeriod", () => {
	it("seit der letzten Bewertung, sonst zwölf Monate", () => {
		expect(digestPeriod("2026-03-01", "2026-10-17")).toEqual({
			from: "2026-03-01",
			to: "2026-10-17",
		});
		expect(digestPeriod(null, "2026-10-17")).toEqual({
			from: "2025-10-17",
			to: "2026-10-17",
		});
	});
});
