import { describe, expect, it } from "vitest";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import {
	BASIC_PICTURE,
	FRAMEWORK_PROFILES,
	ISSUER_KINDS,
	SECTION_SIMPLE,
} from "@/lib/compliance/catalog/framework-profiles";
import { JARGON, sentences, words } from "./helpers/plain-language";

// Teil Z2: jedes Rahmenwerk und jedes Kapitel in Alltagssprache.

function plain(text: string) {
	expect(text.trim()).toBe(text);
	expect(text).toMatch(/[.!?]$/);
	for (const s of sentences(text)) expect(words(s)).toBeLessThanOrEqual(20);
	for (const re of JARGON) expect(text).not.toMatch(re);
}

describe("Rahmenwerke einfach erklärt", () => {
	it("jedes Rahmenwerk hat einen Steckbrief, kein verwaister", () => {
		const slugs = new Set(CATALOG_FRAMEWORKS.map((f) => f.slug));
		expect(
			CATALOG_FRAMEWORKS.filter((f) => !FRAMEWORK_PROFILES[f.slug]).map(
				(f) => f.slug,
			),
		).toEqual([]);
		expect(
			Object.keys(FRAMEWORK_PROFILES).filter((k) => !slugs.has(k)),
		).toEqual([]);
	});

	it.each(
		Object.entries(FRAMEWORK_PROFILES),
	)("%s ist kurz und einfach", (_slug, p) => {
		expect(sentences(p.simple)).toHaveLength(1);
		expect(words(p.simple)).toBeLessThanOrEqual(16);
		expect(ISSUER_KINDS).toContain(p.issuer);
		for (const text of [
			p.simple,
			p.why,
			p.forWhom,
			p.ifNot,
			p.proof,
			p.example,
		])
			plain(text);
		expect(p.example.startsWith("Wie ")).toBe(true);
	});

	it("jedes Kapitel hat einen einfachen Satz, kein verwaister", () => {
		const keys = CATALOG_FRAMEWORKS.flatMap((f) =>
			f.sections.map((s) => `${f.slug}:${s.code}`),
		);
		expect(keys.filter((k) => !SECTION_SIMPLE[k])).toEqual([]);
		expect(
			Object.keys(SECTION_SIMPLE).filter((k) => !keys.includes(k)),
		).toEqual([]);
		for (const text of Object.values(SECTION_SIMPLE)) plain(text);
	});

	it("das Grundbild erklärt jeden Begriff", () => {
		const terms = BASIC_PICTURE.points.map((p) => p.term);
		for (const t of ["Rahmenwerk", "Maßnahme", "Nachweis", "Prüfung"])
			expect(terms.some((x) => x.includes(t))).toBe(true);
		for (const p of BASIC_PICTURE.points) {
			expect(p.text.trim()).toBe(p.text);
			for (const s of sentences(p.text))
				expect(words(s)).toBeLessThanOrEqual(24);
		}
	});
});
