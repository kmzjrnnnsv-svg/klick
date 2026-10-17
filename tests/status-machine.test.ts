import { describe, expect, it } from "vitest";
import { CONTROL_STATUS } from "@/lib/entities/control";
import { DOCUMENT_STATUS_MACHINE } from "@/lib/entities/document";
import { MACHINES } from "@/lib/entities/machines";
import {
	canTransition,
	isDone,
	nextTransitions,
	primaryTransition,
	statusPath,
} from "@/lib/entities/status-machine";
import { TASK_STATUS } from "@/lib/entities/task";
import messages from "@/messages/de.json";

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
	it("Dokument: Gültig kommt mit der Freigabe, nicht per Knopf", () => {
		const m = DOCUMENT_STATUS_MACHINE;
		// In Prüfung: nur der Ausweg zurück in den Entwurf, kein Primärknopf
		const inReview = nextTransitions(m, "in_review", {
			hasNote: true,
			approvalsSatisfied: true,
		});
		expect(inReview.map((t) => t.to)).toEqual(["draft"]);
		expect(inReview.some((t) => t.primary)).toBe(false);
		// Der automatische Übergang ist nicht von Hand auslösbar
		expect(
			canTransition(m, "in_review", "published", { approvalsSatisfied: true }),
		).toEqual({ ok: false, reason: "invalid" });
		// Neue Version nur über den Dialog, nicht per Status
		expect(nextTransitions(m, "published").map((t) => t.to)).toEqual([
			"retired",
		]);
		expect(nextTransitions(m, "retired")).toEqual([]);
		expect(m.transitions.some((t) => t.auto && t.from === "in_review")).toBe(
			true,
		);
	});
	it("„Was jetzt?“: Hinweise für alle Zustände, Texte vorhanden", () => {
		const status = messages.Status as Record<string, string>;
		const withHints = Object.entries(MACHINES).filter(([, m]) => m.hintKey);
		expect(withHints.map(([k]) => k).sort()).toEqual(
			[
				"control",
				"document",
				"incident",
				"nonconformity",
				"process",
				"risk",
				"task",
			].sort(),
		);
		for (const [kind, m] of withHints)
			for (const s of m.states) {
				const key = (m.hintKey as Record<string, string>)[s];
				expect(key, `${kind}.${s}`).toBeTruthy();
				expect(status[key as string], `${kind}.${s}`).toBeTruthy();
			}
	});

	it("Schritt-Leiste: Wege beginnen am Start, enden ohne Schleife", () => {
		for (const [kind, m] of Object.entries(MACHINES)) {
			const path = statusPath(m as never) as string[];
			expect(path[0], kind).toBe(m.initial);
			expect(new Set(path).size, kind).toBe(path.length);
		}
		// Ziel ist „Gültig“; „Archiviert“ ist Nebenzustand
		expect(statusPath(DOCUMENT_STATUS_MACHINE)).toEqual([
			"draft",
			"in_review",
			"published",
		]);
		expect(statusPath(MACHINES.process)).toEqual(["draft", "active"]);
		expect(statusPath(MACHINES.control)).toEqual([
			"not_started",
			"planned",
			"in_progress",
			"implemented",
		]);
	});
});
