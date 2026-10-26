import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	evidenceValidity,
	isCurrentEvidence,
	replaceInSheet,
} from "@/lib/evidence/current";
import { ROOT, walkFiles } from "./helpers/walk";

// Nachweis-Fassungen: eine ersetzte Fassung zählt nicht mehr. Jede Abfrage
// auf evidence oder control_evidence filtert mit currentEvidence() — oder
// trägt in derselben Anweisung den Vermerk „evidence:any-version — Grund“
// (Zeile per ID, Zählung aller Fassungen, Speicher-Abgleich …).

const MARK = "evidence:any-version";

const PATTERN =
	/\.(from|innerJoin|leftJoin|rightJoin)\((evidence|controlEvidence)\b/g;

function unfiltered(src: string): number {
	let n = 0;
	const seen = new Set<number>();
	for (const m of src.matchAll(PATTERN)) {
		// Anweisung bis zum nächsten Semikolon; je Anweisung einmal zählen
		const start = src.lastIndexOf(";", m.index ?? 0) + 1;
		if (seen.has(start)) continue;
		seen.add(start);
		const end = src.indexOf(";", m.index ?? 0);
		const stmt = src.slice(start, end);
		if (!stmt.includes("currentEvidence()") && !stmt.includes(MARK)) n += 1;
	}
	return n;
}

describe("Nachweis-Fassungen", () => {
	it("Stand: ersetzt vor abgelaufen vor gültig", () => {
		const today = "2026-10-25";
		expect(
			evidenceValidity({ supersededAt: null, validUntil: null }, today),
		).toBe("valid");
		expect(
			evidenceValidity({ supersededAt: null, validUntil: "2026-10-25" }, today),
		).toBe("valid");
		expect(
			evidenceValidity({ supersededAt: null, validUntil: "2026-10-24" }, today),
		).toBe("expired");
		expect(
			evidenceValidity(
				{ supersededAt: new Date(), validUntil: "2030-01-01" },
				today,
			),
		).toBe("superseded");
		expect(isCurrentEvidence({ supersededAt: null })).toBe(true);
		expect(isCurrentEvidence({ supersededAt: new Date() })).toBe(false);
	});

	it("Nachweisbogen: alte Fassung wird durch die neue ersetzt, ohne Doppelte", () => {
		const { sheet, changed } = replaceInSheet(
			{
				answers: { q1: { answer: "yes", evidenceIds: ["a", "b"] } },
				items: {
					i1: { mode: "evidence", evidenceIds: ["a", "c"] },
					i2: { mode: "evidence", evidenceIds: ["c"] },
					i3: { mode: "text", note: "x" },
				},
			},
			"a",
			"c",
		);
		expect(changed).toBe(true);
		expect(sheet.answers?.q1?.evidenceIds).toEqual(["c", "b"]);
		expect(sheet.items?.i1?.evidenceIds).toEqual(["c"]);
		expect(sheet.items?.i2?.evidenceIds).toEqual(["c"]);
		expect(sheet.items?.i3).toEqual({ mode: "text", note: "x" });
		expect(replaceInSheet({}, "a", "b").changed).toBe(false);
	});

	it("jede Abfrage auf Nachweise filtert auf die aktuelle Fassung", () => {
		const files = walkFiles(["app", "lib", "components"], /\.tsx?$/).filter(
			(f) => f !== "lib/evidence/current.ts",
		);
		const offenders = files.filter(
			(f) => unfiltered(readFileSync(join(ROOT, f), "utf8")) > 0,
		);
		expect(offenders).toEqual([]);
	});

	it("der Vermerk nennt einen Grund", () => {
		const files = walkFiles(["app", "lib", "components"], /\.tsx?$/);
		for (const f of files) {
			const src = readFileSync(join(ROOT, f), "utf8");
			for (const m of src.matchAll(/evidence:any-version(.*)/g))
				expect(
					m[1]?.trim().replace(/^[—-]\s*/, "").length ?? 0,
				).toBeGreaterThan(5);
		}
	});
});
