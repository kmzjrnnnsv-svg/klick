import { describe, expect, it } from "vitest";
import { currentTrainings, trainingState } from "@/lib/trainings/assignments";

const today = "2026-10-08";

describe("trainingState", () => {
	it("fällig nur innerhalb von 30 Tagen", () => {
		expect(trainingState({ status: "due", dueAt: "2026-10-20" }, today)).toBe(
			"due",
		);
		expect(trainingState({ status: "due", dueAt: "2026-11-07" }, today)).toBe(
			"due",
		);
		expect(trainingState({ status: "due", dueAt: "2026-11-08" }, today)).toBe(
			"planned",
		);
		expect(trainingState({ status: "due", dueAt: "2027-10-08" }, today)).toBe(
			"planned",
		);
	});
	it("überfällig ab dem Tag nach der Frist, erledigt bleibt erledigt", () => {
		expect(trainingState({ status: "due", dueAt: "2026-10-07" }, today)).toBe(
			"overdue",
		);
		expect(trainingState({ status: "done", dueAt: "2020-01-01" }, today)).toBe(
			"done",
		);
	});
});

describe("currentTrainings", () => {
	const base = { requirementId: "r1", userId: "u1", completedAt: null };
	it("Folgezyklus nach Abschluss zählt als erfüllt, nicht als fällig", () => {
		const m = currentTrainings(
			[
				{
					...base,
					id: "a",
					status: "done",
					dueAt: "2026-09-01",
					completedAt: "2026-09-10",
				},
				{ ...base, id: "b", status: "due", dueAt: "2027-09-10" },
			],
			today,
		);
		expect(m.get("r1|u1")?.state).toBe("done");
		expect(m.get("r1|u1")?.open?.id).toBe("b");
	});
	it("offene Zuweisung ohne Abschluss ist geplant, fällig oder überfällig", () => {
		const m = currentTrainings(
			[
				{ ...base, id: "a", status: "due", dueAt: "2026-10-01" },
				{ ...base, id: "c", userId: "u2", status: "due", dueAt: "2026-12-31" },
			],
			today,
		);
		expect(m.get("r1|u1")?.state).toBe("overdue");
		expect(m.get("r1|u2")?.state).toBe("planned");
	});
});
