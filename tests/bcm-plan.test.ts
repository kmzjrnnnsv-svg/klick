import { describe, expect, it } from "vitest";
import {
	emptyPlan,
	normalizePlan,
	planIssues,
	releasable,
	reviewDate,
	seedPlan,
} from "@/lib/bcm/plan";
import { planDocBlocks } from "@/lib/bcm/plan-export";

describe("Notfallplan: Vorschlag", () => {
	const plan = seedPlan({
		process: { name: "Zahlungen", rtoHours: 8 },
		accountable: "function:ciso",
		assets: [
			{ id: "a2", name: "Bankportal", rtoHours: 24 },
			{ id: "a1", name: "Server", rtoHours: 4 },
			{ id: "a3", name: "Archiv", rtoHours: null },
		],
		providers: [{ name: "Cloud GmbH" }],
	});

	it("Wiederanlauf nach dem Wiederanlauf der Assets, ohne Wert zuletzt", () => {
		expect(plan.recovery.map((r) => r.assetId)).toEqual(["a1", "a2", "a3"]);
		expect(plan.recovery[0]?.targetHours).toBe(4);
	});

	it("Alarmierung über Notfallmanagement, Krisenstab, Stelle, Geschäftsleitung", () => {
		expect(plan.alert.map((a) => a.who)).toEqual([
			"function:bcm_manager",
			"function:crisis_team",
			"function:ciso",
			"function:management_body",
		]);
	});

	it("Auslöser nennt das RTO, Dienstleister werden Kontakte", () => {
		expect(plan.trigger).toContain("8 Stunden");
		expect(plan.contacts[0]?.name).toBe("Cloud GmbH");
	});

	it("Vorschlag ist freigebbar, ein Schritt über dem RTO wird gemeldet", () => {
		const issues = planIssues(plan, { rtoHours: 8 }, null, "2026-11-04");
		expect(issues).toEqual(["recovery_over_rto"]);
		expect(releasable(issues)).toBe(true);
	});
});

describe("Notfallplan: Vorschlag ohne Assets", () => {
	it("ein allgemeiner Wiederanlauf-Schritt mit dem RTO als Ziel", () => {
		const plan = seedPlan({
			process: { name: "Zahlungen", rtoHours: 8 },
			accountable: null,
			assets: [],
			providers: [],
		});
		expect(plan.recovery).toHaveLength(1);
		expect(plan.recovery[0]?.targetHours).toBe(8);
		expect(releasable(planIssues(plan, { rtoHours: 8 }, null, ""))).toBe(true);
	});
});

describe("Notfallplan: Hinweise und Freigabe", () => {
	it("leerer Plan ist nicht freigebbar", () => {
		const issues = planIssues(emptyPlan(), { rtoHours: null }, null, "");
		expect(issues).toEqual(["no_trigger", "no_alert", "no_recovery"]);
		expect(releasable(issues)).toBe(false);
	});

	it("Überprüfung fällig", () => {
		const issues = planIssues(
			{ ...emptyPlan(), trigger: "x" },
			{ rtoHours: null },
			"2026-01-01",
			"2026-11-04",
		);
		expect(issues).toContain("review_due");
	});

	it("Überprüfung zwölf Monate nach der Freigabe", () => {
		expect(reviewDate(new Date("2026-11-04T10:00:00Z"))).toBe("2027-11-04");
	});
});

describe("Notfallplan: bereinigen", () => {
	it("leere Zeilen weg, Zahlen begrenzt, unbekannter Kanal = Sonstiges", () => {
		const n = normalizePlan({
			...emptyPlan(),
			trigger: "  Ausfall  ",
			immediate: [{ text: " " }, { text: "Lage feststellen" }],
			alert: [
				{ who: "", channel: "phone", withinMinutes: 5 },
				{
					who: "function:ciso",
					channel: "fax" as "phone",
					withinMinutes: -3,
				},
			],
			recovery: [{ text: "Server", who: "", targetHours: 1e9, assetId: "" }],
			contacts: [{ name: "", role: "x", phone: "", mail: "" }],
		});
		expect(n.trigger).toBe("Ausfall");
		expect(n.immediate).toEqual([{ text: "Lage feststellen" }]);
		expect(n.alert).toEqual([
			{ who: "function:ciso", channel: "other", withinMinutes: 0 },
		]);
		expect(n.recovery[0]?.targetHours).toBe(100_000);
		expect(n.recovery[0]?.assetId).toBeNull();
		expect(n.contacts).toEqual([]);
	});
});

describe("Notfallplan als Dokument", () => {
	it("sieben Abschnitte, Namen über die Funktionen", () => {
		const blocks = planDocBlocks(
			seedPlan({
				process: { name: "Zahlungen", rtoHours: 8 },
				accountable: null,
				assets: [{ id: "a1", name: "Server", rtoHours: 4 }],
				providers: [],
			}),
			{ who: (r) => `W:${r}`, asset: (id) => `A:${id}` },
		);
		expect(blocks.filter((b) => b.type === "heading")).toHaveLength(7);
		const recovery = blocks.find(
			(b) => b.type === "table" && b.columns[1]?.label === "Schritt",
		);
		expect(recovery?.type === "table" && recovery.rows[0]?.[4]).toBe("A:a1");
	});
});
