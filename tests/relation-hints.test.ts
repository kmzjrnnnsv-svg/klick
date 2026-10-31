import { describe, expect, it } from "vitest";
import { COMPLIANCE_PROCESS } from "@/lib/compliance/catalog/compliance-process";
import { evidenceReach, relationHint } from "@/lib/compliance/relation-hints";
import { JARGON, sentences, words } from "./helpers/plain-language";

// Teil Z7: Zusammenhänge im Ablauf (Gap-Analyse, Nachweis, Ablauf-Schritte)

describe("relationHint", () => {
	it("Vorfall melden: alle drei, DORA am strengsten", () => {
		const h = relationHint(
			"CC-INC-03",
			{ frameworks: ["dora", "nis2", "dsgvo"] },
			(t) => t,
		);
		expect(h.simple).toBeTruthy();
		expect(h.frameworks).toEqual(["DORA", "NIS2 / BSIG", "DSGVO / BDSG"]);
		const initial = h.strictest.find((s) => s.topic === "deadline:initial");
		expect(initial?.names).toEqual(["DORA"]);
		expect(initial?.value).toBeTruthy();
	});

	it("ohne passende Rahmenwerke bleibt nur die Erklärung", () => {
		const h = relationHint("CC-INC-03", { frameworks: ["kassen"] }, (t) => t);
		expect(h.frameworks).toEqual([]);
		expect(h.strictest).toEqual([]);
	});

	it("Nachweis zählt für die Vereinigung seiner Maßnahmen", () => {
		const r = evidenceReach(["CC-INC-03", "CC-PRV-01"], {
			frameworks: ["dora", "dsgvo"],
		});
		expect(r.frameworks).toContain("DORA");
		expect(r.frameworks).toContain("DSGVO / BDSG");
		expect(new Set(r.frameworks).size).toBe(r.frameworks.length);
	});
});

describe("Ablauf in sechs Schritten", () => {
	it("einfach, mit Beispiel und Stelle in Klick", () => {
		expect(COMPLIANCE_PROCESS).toHaveLength(6);
		for (const s of COMPLIANCE_PROCESS) {
			expect(s.href.startsWith("/")).toBe(true);
			for (const text of [s.what, s.example]) {
				expect(text).toMatch(/[.!?]$/);
				for (const x of sentences(text))
					expect(words(x)).toBeLessThanOrEqual(20);
				for (const re of JARGON) expect(text).not.toMatch(re);
			}
		}
	});
});
