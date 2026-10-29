import { describe, expect, it } from "vitest";
import { contentDiff } from "@/lib/documents/content-diff";
import { diffLines, diffWords } from "@/lib/documents/diff";
import {
	changedFields,
	compactDiff,
	diffStat,
	pairChanges,
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

describe("Diff langer Texte", () => {
	const base = Array.from({ length: 5000 }, (_, i) => `Absatz ${i}`);

	it("gleicher Anfang und gleiches Ende: nur die Änderung", () => {
		const after = [...base];
		after[2500] = "Absatz 2500 neu";
		const lines = diffLines(base.join("\n"), after.join("\n"));
		expect(diffStat(lines)).toEqual({ added: 1, removed: 1 });
		expect(lines.filter((l) => l.type === "same")).toHaveLength(4999);
	});

	it("Änderungen weit auseinander: Anker statt „alles neu“", () => {
		const after = [...base];
		after[10] = "Anfang geändert";
		after[4990] = "Ende geändert";
		after.splice(2000, 0, "eingefügt");
		const lines = diffLines(base.join("\n"), after.join("\n"));
		expect(diffStat(lines)).toEqual({ added: 3, removed: 2 });
	});

	it("ohne gemeinsame Zeilen über der Grenze: alles neu, kein Absturz", () => {
		const a = Array.from({ length: 3000 }, () => "x").join("\n");
		const b = Array.from({ length: 3000 }, () => "y").join("\n");
		expect(diffStat(diffLines(a, b))).toEqual({ added: 3000, removed: 3000 });
	});
});

describe("Wortvergleich", () => {
	it("markiert nur die geänderten Wörter", () => {
		expect(
			diffWords("Die Frist beträgt 30 Tage.", "Die Frist beträgt 14 Tage."),
		).toEqual([
			{ type: "same", text: "Die Frist beträgt " },
			{ type: "del", text: "30" },
			{ type: "add", text: "14" },
			{ type: "same", text: " Tage." },
		]);
	});

	it("paart ähnliche Absätze, unähnliche bleiben für sich", () => {
		const lines = compactDiff(
			diffLines(
				"Kopf\nDie Frist beträgt 30 Tage.\nAlter Absatz ganz anders",
				"Kopf\nDie Frist beträgt 14 Tage.\nNeu: völlig anderer Inhalt hier",
			),
			1,
		);
		const shown = pairChanges(lines);
		expect(shown.map((l) => l.type)).toEqual(["same", "change", "del", "add"]);
	});

	it("eingeschobene neue Zeile vor dem geänderten Absatz", () => {
		const shown = pairChanges(
			compactDiff(
				diffLines(
					"Kopf\nDie Frist beträgt 30 Tage.",
					"Kopf\nGanz neuer Absatz\nDie Frist beträgt 14 Tage.",
				),
				1,
			),
		);
		expect(shown.map((l) => l.type)).toEqual(["same", "add", "change"]);
	});
});

describe("Vergleich von Text und Datei", () => {
	const file = (sha: string) => ({ name: `${sha}.pdf`, sha256: sha });
	const ok = (text: string) => ({
		status: "ok" as const,
		text,
		truncated: false,
	});

	it("zählt Text und Dateiinhalt zusammen", () => {
		const d = contentDiff(
			{ bodyMarkdown: "a\nb", file: file("1"), fileText: ok("x\ny") },
			{ bodyMarkdown: "a\nB", file: file("2"), fileText: ok("x\nz\nw") },
		);
		expect(d.text?.added).toBe(1);
		expect(d.file.kind).toBe("replaced");
		expect(d.file.kind === "replaced" && d.file.diff?.added).toBe(2);
		expect(d.added).toBe(3);
		expect(d.removed).toBe(2);
	});

	it("nennt den Grund, wenn der Inhalt fehlt", () => {
		const d = contentDiff(
			{ bodyMarkdown: null, file: file("1"), fileText: ok("x") },
			{ bodyMarkdown: null, file: file("2"), fileText: { status: "no_text" } },
		);
		expect(d.file).toMatchObject({
			kind: "replaced",
			diff: null,
			hint: "no_text",
		});
		const p = contentDiff(
			{ bodyMarkdown: null, file: file("1"), fileText: { status: "pending" } },
			{ bodyMarkdown: null, file: file("2"), fileText: { status: "error" } },
		);
		expect(p.file).toMatchObject({ hint: "pending" });
	});

	it("gleiche Datei: kein Dateivergleich; neu bzw. entfernt", () => {
		expect(
			contentDiff(
				{ bodyMarkdown: "a", file: file("1"), fileText: ok("x") },
				{ bodyMarkdown: "a", file: file("1"), fileText: ok("x") },
			),
		).toEqual({ text: null, file: { kind: "none" }, added: 0, removed: 0 });
		expect(
			contentDiff(
				{ bodyMarkdown: null, file: null, fileText: null },
				{ bodyMarkdown: null, file: file("2"), fileText: ok("x") },
			).file,
		).toEqual({ kind: "added", name: "2.pdf" });
	});
});
