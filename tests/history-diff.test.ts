import { describe, expect, it } from "vitest";
import {
	diffRecords,
	formatValue,
	mergeActivity,
	toHistoryItems,
} from "@/lib/history";

describe("history diff", () => {
	it("zeigt nur geänderte Felder, ignoriert Zeitstempel und IDs", () => {
		const d = diffRecords(
			{
				status: "planned",
				note: null,
				updatedAt: "2026-01-01",
				id: "x",
				owner: "a",
			},
			{
				status: "in_progress",
				note: "los",
				updatedAt: "2026-02-02",
				id: "x",
				owner: "a",
			},
		);
		expect(d).toEqual([
			{ field: "note", before: null, after: "los" },
			{ field: "status", before: "planned", after: "in_progress" },
		]);
	});

	it("behandelt undefined und null gleich, vergleicht Arrays und Daten strukturell", () => {
		expect(diffRecords({ a: undefined }, { a: null })).toEqual([]);
		expect(diffRecords({ tags: ["x"] }, { tags: ["x"] })).toEqual([]);
		expect(diffRecords({ tags: ["x"] }, { tags: ["x", "y"] })).toHaveLength(1);
		const d = new Date("2026-05-01T00:00:00Z");
		expect(
			diffRecords({ at: d }, { at: new Date("2026-05-01T00:00:00Z") }),
		).toEqual([]);
	});

	it("Nur-after (Anlage) listet alle Felder als neu", () => {
		const d = diffRecords(null, { status: "not_started", code: "CC-CRY-01" });
		expect(d.map((c) => c.field)).toEqual(["code", "status"]);
		expect(d[0]?.before).toBeNull();
	});

	it("toHistoryItems und mergeActivity sortieren neueste zuerst", () => {
		const items = toHistoryItems([
			{
				id: "1",
				at: new Date("2026-01-01"),
				actorUserId: "u1",
				action: "control.status",
				before: { status: "planned" },
				after: { status: "in_progress" },
			},
		]);
		expect(items[0]?.changes).toHaveLength(1);
		const merged = mergeActivity(items, [
			{
				type: "comment",
				at: new Date("2026-02-01"),
				comment: {
					id: "c",
					authorUserId: "u2",
					bodyMarkdown: "hi",
					parentId: null,
					editedAt: null,
				},
			},
		]);
		expect(merged.map((e) => e.type)).toEqual(["comment", "history"]);
	});

	it("formatValue bleibt kurz und lesbar", () => {
		expect(formatValue(null)).toBe("—");
		expect(formatValue(true)).toBe("ja");
		expect(formatValue(["a", "b"])).toBe("a, b");
		expect(formatValue("x".repeat(100))).toHaveLength(80);
		expect(formatValue(new Date("2026-03-04T10:00:00Z"))).toBe("2026-03-04");
	});
});
