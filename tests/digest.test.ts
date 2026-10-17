import { describe, expect, it } from "vitest";
import { dsrStats } from "@/lib/compliance/privacy";
import { buildDigest } from "@/lib/jobs/digest";

describe("Digest", () => {
	it("mehr als 40 Punkte: die neuesten bleiben, die ältesten fallen weg", () => {
		const items = Array.from({ length: 45 }, (_, i) => ({
			kind: "mentioned" as const,
			title: `Punkt ${i}`,
			body: null,
			link: null,
			createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
		}));
		const d = buildDigest(items, {
			baseUrl: "https://klick.test",
			recipientName: "Ana",
			date: new Date("2026-10-02T05:00:00Z"),
		});
		expect(d?.html).toContain("Punkt 44");
		expect(d?.html).not.toContain("Punkt 0<");
		expect(d?.text).toContain("… und 5 weitere");
	});
});

describe("Betroffenenanfragen", () => {
	it("Bearbeitungsdauer ab Eingang", () => {
		const s = dsrStats(
			[
				{
					receivedAt: new Date("2026-10-01T10:00:00Z"),
					dueAt: new Date("2026-11-01T22:59:59Z"),
					extendedUntil: null,
					completedAt: new Date("2026-10-11T10:00:00Z"),
					status: "done",
				},
			],
			new Date("2026-10-20T10:00:00Z"),
		);
		expect(s.avgDays).toBe(10);
	});
});
