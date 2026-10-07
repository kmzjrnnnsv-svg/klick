import { describe, expect, it } from "vitest";
import { CONTROL_STATUS } from "@/lib/entities/control";
import {
	canTransition,
	isDone,
	nextTransitions,
	primaryTransition,
} from "@/lib/entities/status-machine";
import { TASK_STATUS } from "@/lib/entities/task";

describe("status machine", () => {
	it("Control: not_started → planned ist der Primärübergang", () => {
		expect(primaryTransition(CONTROL_STATUS, "not_started")?.to).toBe(
			"planned",
		);
		expect(
			nextTransitions(CONTROL_STATUS, "not_started").map((t) => t.to),
		).toEqual(["planned", "in_progress", "not_applicable"]);
	});

	it("not_applicable verlangt eine Begründung", () => {
		expect(
			canTransition(CONTROL_STATUS, "in_progress", "not_applicable"),
		).toEqual({
			ok: false,
			reason: "note",
		});
		expect(
			canTransition(CONTROL_STATUS, "in_progress", "not_applicable", {
				hasNote: true,
			}),
		).toEqual({ ok: true });
		const t = nextTransitions(CONTROL_STATUS, "planned").find(
			(x) => x.to === "not_applicable",
		);
		expect(t?.enabled).toBe(false);
		expect(t?.blockedBy).toBe("note");
	});

	it("ungültige Übergänge werden abgelehnt", () => {
		expect(canTransition(CONTROL_STATUS, "not_started", "implemented")).toEqual(
			{
				ok: false,
				reason: "invalid",
			},
		);
		expect(canTransition(CONTROL_STATUS, "implemented", "not_started")).toEqual(
			{
				ok: false,
				reason: "invalid",
			},
		);
	});

	it("implemented und not_applicable gelten als erledigt", () => {
		expect(isDone(CONTROL_STATUS, "implemented")).toBe(true);
		expect(isDone(CONTROL_STATUS, "not_applicable")).toBe(true);
		expect(isDone(CONTROL_STATUS, "in_progress")).toBe(false);
	});

	it("Aufgaben: blockieren braucht Grund, wieder öffnen nicht", () => {
		expect(primaryTransition(TASK_STATUS, "todo")?.to).toBe("doing");
		expect(canTransition(TASK_STATUS, "doing", "blocked")).toEqual({
			ok: false,
			reason: "note",
		});
		expect(canTransition(TASK_STATUS, "done", "todo")).toEqual({ ok: true });
	});

	it("jede Maschine: alle Übergänge referenzieren bekannte Zustände", () => {
		for (const m of [CONTROL_STATUS, TASK_STATUS]) {
			const states = new Set<string>(m.states);
			for (const t of m.transitions) {
				expect(states.has(t.from)).toBe(true);
				expect(states.has(t.to)).toBe(true);
			}
			expect(states.has(m.initial)).toBe(true);
		}
	});
});
