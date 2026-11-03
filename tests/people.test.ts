import { describe, expect, it } from "vitest";
import {
	matchesPerson,
	personDueStatus,
	REMIND_INTERVAL_MS,
	remindAllowed,
	teamView,
} from "@/lib/compliance/people";

describe("Personen", () => {
	it("liest die Ansicht aus der URL, sonst alle", () => {
		expect(teamView("offen")).toBe("offen");
		expect(teamView("eingeladen")).toBe("eingeladen");
		expect(teamView("x")).toBe("alle");
		expect(teamView(undefined)).toBe("alle");
	});

	it("ordnet offene Punkte ein", () => {
		expect(personDueStatus(undefined)).toEqual({
			overdue: 0,
			soon: 0,
			level: "none",
		});
		expect(personDueStatus({ overdue: 0, soon: 2 }).level).toBe("soon");
		expect(personDueStatus({ overdue: 1, soon: 2 }).level).toBe("overdue");
	});

	it("erinnert höchstens einmal in 24 Stunden", () => {
		const now = new Date("2026-11-03T12:00:00Z");
		expect(remindAllowed(null, now)).toBe(true);
		expect(
			remindAllowed(new Date(now.getTime() - REMIND_INTERVAL_MS + 1000), now),
		).toBe(false);
		expect(
			remindAllowed(new Date(now.getTime() - REMIND_INTERVAL_MS), now),
		).toBe(true);
	});

	it("sucht in Name und E-Mail", () => {
		const p = { name: "Anna Berg", email: "anna@beispiel.de" };
		expect(matchesPerson(p, "berg")).toBe(true);
		expect(matchesPerson(p, "BEISPIEL")).toBe(true);
		expect(matchesPerson(p, "otto")).toBe(false);
		expect(matchesPerson({ name: null, email: "x@y.de" }, "")).toBe(true);
	});
});
