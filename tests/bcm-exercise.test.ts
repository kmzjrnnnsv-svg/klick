import { describe, expect, it } from "vitest";
import {
	exerciseControl,
	exerciseOutcome,
	formatMinutes,
	measuresTime,
	normalizeExercise,
	seedScript,
} from "@/lib/bcm/exercise";
import { seedPlan } from "@/lib/bcm/plan";

const step = (
	ok: boolean | null,
	expected: number | null = null,
	actual: number | null = null,
) => ({
	text: "x",
	expectedMinutes: expected,
	actualMinutes: actual,
	ok,
	note: "",
});

describe("Übung: Ergebnis", () => {
	const target = { rtoHours: 4, rpoHours: 1 };
	it("RTO überschritten = nicht bestanden", () => {
		const o = exerciseOutcome(
			"restore_test",
			target,
			{ recoveryMinutes: 300, dataLossMinutes: 30 },
			[step(true)],
		);
		expect(o.result).toBe("fail");
		expect(o.rtoMet).toBe(false);
		expect(o.rpoMet).toBe(true);
	});
	it("RPO überschritten = nicht bestanden", () => {
		expect(
			exerciseOutcome(
				"failover",
				target,
				{ recoveryMinutes: 60, dataLossMinutes: 90 },
				[step(true)],
			).result,
		).toBe("fail");
	});
	it("alles eingehalten = bestanden", () => {
		const o = exerciseOutcome(
			"restore_test",
			target,
			{ recoveryMinutes: 240, dataLossMinutes: 60 },
			[step(true, 30, 25)],
		);
		expect(o.result).toBe("pass");
	});
	it("Schritt zu spät, offen oder nicht in Ordnung = teilweise", () => {
		const m = { recoveryMinutes: 60, dataLossMinutes: 10 };
		expect(
			exerciseOutcome("dry_run", target, m, [step(true, 10, 20)]).result,
		).toBe("partial");
		expect(exerciseOutcome("dry_run", target, m, [step(null)]).result).toBe(
			"partial",
		);
		expect(exerciseOutcome("dry_run", target, m, [step(false)]).result).toBe(
			"partial",
		);
	});
	it("echter Test ohne Messung = teilweise, Planspiel ohne Messung bestanden", () => {
		const none = { recoveryMinutes: null, dataLossMinutes: null };
		expect(
			exerciseOutcome("restore_test", target, none, [step(true)]).result,
		).toBe("partial");
		expect(exerciseOutcome("tabletop", target, none, [step(true)]).result).toBe(
			"pass",
		);
	});
});

describe("Übung: Zuordnung und Drehbuch", () => {
	it("Control je Art", () => {
		expect(exerciseControl("restore_test")).toBe("CC-BCM-03");
		expect(exerciseControl("failover")).toBe("CC-BCM-04");
		expect(exerciseControl("tabletop")).toBe("CC-BCM-05");
		expect(measuresTime("tabletop")).toBe(false);
		expect(measuresTime("full")).toBe(true);
	});
	it("Drehbuch aus dem Notfallplan mit Soll-Zeiten", () => {
		const plan = seedPlan({
			process: { name: "Zahlungen", rtoHours: 8 },
			accountable: null,
			assets: [{ id: "a1", name: "Server", rtoHours: 4 }],
			providers: [],
		});
		const script = seedScript(plan, (r) => `W:${r}`);
		expect(script[4]?.text).toBe("W:function:bcm_manager alarmieren");
		expect(script[4]?.expectedMinutes).toBe(15);
		expect(script.at(-1)?.expectedMinutes).toBe(240);
	});
	it("ohne Plan ein Grundgerüst", () => {
		expect(seedScript(null, (r) => r)).toHaveLength(4);
	});
});

describe("Übung: bereinigen und anzeigen", () => {
	it("leere Zeilen weg, Minuten begrenzt", () => {
		const n = normalizeExercise({
			title: " ",
			scenario: "x",
			script: [
				{ ...step(true), text: " " },
				{ ...step(null, -5, 1e9), text: "Server" },
			],
			participants: [{ who: "", role: "x" }],
			lessons: "",
			measures: ["", " Backup prüfen "],
			recoveryMinutes: -1,
			dataLossMinutes: null,
		});
		expect(n.title).toBe("Notfallübung");
		expect(n.script).toHaveLength(1);
		expect(n.script[0]?.expectedMinutes).toBe(0);
		expect(n.script[0]?.actualMinutes).toBe(525_600);
		expect(n.participants).toEqual([]);
		expect(n.measures).toEqual(["Backup prüfen"]);
		expect(n.recoveryMinutes).toBe(0);
	});
	it("Minuten lesbar", () => {
		expect(formatMinutes(45)).toBe("45 Min.");
		expect(formatMinutes(150)).toBe("2 h 30 Min.");
		expect(formatMinutes(60 * 28)).toBe("1 Tag 4 h");
	});
});
