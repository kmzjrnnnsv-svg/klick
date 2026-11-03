import { describe, expect, it } from "vitest";
import {
	auditTimeline,
	loadTotal,
	periodOf,
	rankPeople,
} from "@/lib/compliance/report";

describe("Auswertung", () => {
	it("liest den Zeitraum aus der URL, sonst 90 Tage", () => {
		expect(periodOf("30")).toBe(30);
		expect(periodOf("365")).toBe(365);
		expect(periodOf("7")).toBe(90);
		expect(periodOf(undefined)).toBe(90);
	});

	it("ordnet Personen nach Überfälligem und fasst den Rest zusammen", () => {
		const row = (
			userId: string,
			overdue: number,
			soon: number,
			planned = 0,
		) => ({
			userId,
			overdue,
			soon,
			planned,
			undated: 0,
		});
		const r = rankPeople(
			[
				row("a", 0, 1, 5),
				row("b", 2, 0),
				row("c", 2, 3),
				row("d", 0, 0),
				row("e", 1, 0),
			],
			3,
		);
		expect(r.top.map((x) => x.userId)).toEqual(["c", "b", "e"]);
		expect(r.rest).toEqual({
			overdue: 0,
			soon: 1,
			planned: 5,
			undated: 0,
			people: 1,
		});
		expect(loadTotal(row("x", 1, 2, 3))).toBe(6);
		expect(rankPeople([row("a", 1, 0)]).rest).toBeNull();
	});

	it("baut die Audit-Zeitleiste aus Register und Turnus", () => {
		const t = auditTimeline({
			frameworks: ["iso27001"],
			settings: { iso27001: { anchors: { certification: "2026-03-01" } } },
			registered: [],
			audits: [
				{
					id: "a1",
					title: "Läuft",
					type: "external",
					status: "in_progress",
					plannedAt: "2026-10-01",
					performedAt: null,
					frameworkIds: ["iso27001"],
				},
				{
					id: "a2",
					title: "Geplant",
					type: "internal",
					status: "planned",
					plannedAt: "2026-12-01",
					performedAt: null,
					frameworkIds: ["iso27001"],
				},
				{
					id: "a3",
					title: "Anderes",
					type: "internal",
					status: "planned",
					plannedAt: "2026-12-01",
					performedAt: null,
					frameworkIds: ["dora"],
				},
				{
					id: "a4",
					title: "Vorbei",
					type: "internal",
					status: "closed",
					plannedAt: "2026-12-01",
					performedAt: null,
					frameworkIds: [],
				},
			],
			today: "2026-11-03",
			labels: {
				cycle: (label) => ({ label, detail: "Turnus" }),
				audit: (a) => a.type,
			},
		});
		expect(t.start).toBe("2026-11-03");
		expect(t.end > "2027-10-01").toBe(true);
		const byKey = new Map(t.items.map((i) => [i.key, i]));
		expect(byKey.get("a1")?.date).toBe("2026-11-03");
		expect(byKey.get("a1")?.tone).toBe("success");
		expect(byKey.get("a2")?.href).toBe("/audits/a2");
		expect(byKey.has("a3")).toBe(false);
		expect(byKey.has("a4")).toBe(false);
		expect(t.items.some((i) => i.key.startsWith("cycle-iso27001"))).toBe(true);
		// interne Audits ohne Anker: Hinweis „Termine festlegen“
		expect(t.missing).toBe(true);
	});
});
