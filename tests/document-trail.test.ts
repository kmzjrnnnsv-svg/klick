import { describe, expect, it } from "vitest";
import { diffLines } from "@/lib/documents/diff";
import {
	changedFields,
	compactDiff,
	diffStat,
	type TrailEvent,
	versionTrails,
} from "@/lib/documents/trail";

const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
const ev = (
	h: number,
	actor: string,
	action: string,
	after: unknown = {},
): TrailEvent => ({ at: at(h), actorUserId: actor, action, after });

describe("Verlauf je Fassung", () => {
	const events: TrailEvent[] = [
		ev(1, "anna", "document.create", { docNumber: "RL-1" }),
		ev(2, "anna", "document.update", { bodyMarkdown: "(geändert)" }),
		ev(3, "bert", "document.update", {
			distribution: ["all"],
			nextReviewAt: "2027-01-01",
		}),
		ev(4, "anna", "document.review_requested", { status: "in_review" }),
		ev(5, "cleo", "document.published", { version: "1.0" }),
		ev(6, "bert", "document.version", {
			version: "1.1",
			changeSummary: "Rollen",
		}),
		ev(7, "bert", "document.update", { bodyMarkdown: "(geändert)" }),
		ev(8, "dora", "document.file_uploaded", { version: "1.1" }),
		ev(9, "bert", "document.status", { status: "in_review" }),
	];
	// Reihenfolge im Protokoll ist egal (historyFor liefert neueste zuerst)
	const trails = versionTrails("1.0", [...events].reverse());

	it("erste Fassung: angelegt, bearbeitet, eingereicht, veröffentlicht", () => {
		const t = trails.get("1.0");
		expect(t?.startedBy).toBe("anna");
		expect(t?.editors).toEqual([
			{ userId: "anna", count: 1, fields: ["bodyMarkdown"] },
			{ userId: "bert", count: 1, fields: ["distribution"] },
		]);
		expect(t?.submittedBy).toBe("anna");
		expect(t?.publishedBy).toBe("cleo");
	});

	it("neue Fassung: Bearbeitungen danach zählen zu ihr", () => {
		const t = trails.get("1.1");
		expect(t?.startedBy).toBe("bert");
		expect(t?.editors).toEqual([
			{ userId: "bert", count: 2, fields: ["changeSummary", "bodyMarkdown"] },
			{ userId: "dora", count: 1, fields: ["file"] },
		]);
		expect(t?.submittedBy).toBe("bert");
		expect(t?.publishedBy).toBeNull();
	});

	it("abgeleitete Spalten zählen nicht, unbekannte als „other“", () => {
		expect(
			changedFields({ nextReviewAt: "x", ownerFunction: "isb", foo: 1 }),
		).toEqual(["owner", "other"]);
		expect(changedFields({ bodyMarkdown: undefined })).toEqual([]);
	});
});

describe("Änderungen zwischen Fassungen", () => {
	const lines = diffLines("a\nb\nc\nd\ne\nf", "a\nB\nc\nd\ne\nf\ng");

	it("zählt neue und entfernte Zeilen", () => {
		expect(diffStat(lines)).toEqual({ added: 2, removed: 1 });
	});

	it("zeigt nur Änderungen mit Umgebung und Lücken", () => {
		const c = compactDiff(lines, 1);
		expect(c[0]).toEqual({ type: "same", text: "a" });
		expect(c.some((l) => l.type === "gap")).toBe(true);
		expect(c.at(-1)).toEqual({ type: "add", text: "g" });
		expect(compactDiff(diffLines("x", "x"))).toEqual([]);
	});
});
