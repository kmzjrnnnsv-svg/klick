import { describe, expect, it } from "vitest";
import { CONTROLS } from "@/lib/compliance/catalog";
import { CONTROL_EXPLAINERS } from "@/lib/compliance/catalog/control-explainers";
import { JARGON, sentences, words } from "./helpers/plain-language";

// Teil Z3: jede Maßnahme in Alltagssprache. Kurze Sätze, ein Bild aus dem
// Alltag, keine Fachwörter ohne Erklärung.

describe("Maßnahmen einfach erklärt", () => {
	it("jede Maßnahme hat eine Erklärung, keine verwaiste", () => {
		const codes = new Set<string>(CONTROLS.map((c) => c.code));
		expect(CONTROLS.filter((c) => !CONTROL_EXPLAINERS[c.code])).toEqual([]);
		expect(
			Object.keys(CONTROL_EXPLAINERS).filter((k) => !codes.has(k)),
		).toEqual([]);
	});

	it.each(
		Object.entries(CONTROL_EXPLAINERS),
	)("%s ist kurz und einfach", (_code, e) => {
		expect(sentences(e.what).length).toBeLessThanOrEqual(2);
		for (const text of [e.what, e.why, e.example]) {
			expect(text.trim()).toBe(text);
			expect(text).toMatch(/[.!?]$/);
			for (const s of sentences(text)) expect(words(s)).toBeLessThanOrEqual(20);
			for (const re of JARGON) expect(text).not.toMatch(re);
		}
		expect(e.example.startsWith("Wie ")).toBe(true);
	});
});
