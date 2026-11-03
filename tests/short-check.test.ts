import { describe, expect, it } from "vitest";
import type { AssessmentQuestion } from "@/db/schema/enums";
import {
	extendQuestions,
	missingQuestions,
	SHORT_CHECK_SIZE,
	shortCheck,
} from "@/lib/assessments/short-check";

const q = (
	code: string,
	weight: number,
	section = "governance",
	frameworks: string[] = ["iso27001"],
): AssessmentQuestion => ({
	code,
	sectionCode: section,
	sectionTitle: section,
	text: code,
	weight,
	frameworks,
});

describe("Kurz-Check", () => {
	it("nimmt die Fragen mit dem meisten Gewicht und hält die Reihenfolge", () => {
		const all = [
			q("A", 1),
			q("B", 9),
			q("C", 3, "access"),
			q("D", 9, "access", ["iso27001", "dora"]),
			q("E", 2),
		];
		expect(shortCheck(all, 3).map((x) => x.code)).toEqual(["B", "C", "D"]);
	});

	it("bricht Gleichstand über die Zahl der Rahmenwerke, dann den Code", () => {
		const all = [q("Z", 5), q("Y", 5, "x", ["a", "b"]), q("X", 5)];
		expect(shortCheck(all, 2).map((x) => x.code)).toEqual(["Y", "X"]);
	});

	it("lässt kleine Fragebögen ganz", () => {
		const all = [q("A", 1), q("B", 2)];
		expect(shortCheck(all)).toEqual(all);
		expect(SHORT_CHECK_SIZE).toBe(30);
	});
});

describe("Erweitern auf alle Fragen", () => {
	it("ergänzt fehlende Fragen in der Reihenfolge des ganzen Fragebogens", () => {
		const changed = { ...q("B", 9), text: "Schnappschuss" };
		const current = [changed, q("OLD", 1)];
		const all = [q("A", 1), q("B", 9), q("C", 3)];
		const r = extendQuestions(current, all);
		expect(r.added).toBe(2);
		expect(r.questions.map((x) => x.code)).toEqual(["A", "B", "C", "OLD"]);
		// vorhandene Frage bleibt der Schnappschuss
		expect(r.questions[1]?.text).toBe("Schnappschuss");
		expect(missingQuestions(current, all)).toBe(2);
		expect(missingQuestions(r.questions, all)).toBe(0);
	});
});
