import { describe, expect, it } from "vitest";
import { CATALOG_FRAMEWORKS, CONTROLS } from "@/lib/compliance/catalog";
import {
	FRAMEWORK_RELATIONS,
	RELATION_KINDS,
	relationsOf,
} from "@/lib/compliance/catalog/framework-relations";
import { THEME_INFO, THEMES, themeOf } from "@/lib/compliance/catalog/themes";
import {
	controlsByFramework,
	mapLayout,
	overlap,
	pairConflicts,
	pairDifferences,
	themeGroups,
	topPairs,
} from "@/lib/compliance/framework-map";
import { JARGON, sentences, words } from "./helpers/plain-language";

// Teil Z5/Z6: Rahmenwerke untereinander, Themen, Lage der Übersicht

const plain = (text: string) => {
	expect(text).toMatch(/[.!?]$/);
	for (const s of sentences(text)) expect(words(s)).toBeLessThanOrEqual(22);
	for (const re of JARGON) expect(text).not.toMatch(re);
};

describe("framework-map", () => {
	const all = controlsByFramework();

	it("ISO 27001 und SOC 2 teilen fast alles", () => {
		const o = overlap("iso27001", "soc2", all);
		expect(o.share).toBeGreaterThan(0.8);
		expect(topPairs(all, 12).map((p) => [p.a, p.b])).toContainEqual([
			"iso27001",
			"soc2",
		]);
	});

	it("Meldefristen: die strengere gewinnt", () => {
		const d = pairDifferences("dora", "nis2", all).find(
			(x) => x.topic === "deadline:initial",
		);
		expect(d?.stricter).toBe("a");
	});

	it("Aufbewahren gegen Löschen ist ein Widerspruch", () => {
		expect(pairConflicts("zag-marisk", "dsgvo", all).length).toBeGreaterThan(0);
	});

	it("Auswahl und Anwendbarkeit filtern", () => {
		const m = controlsByFramework({ frameworks: ["dora", "nis2"] });
		expect([...m.keys()].sort()).toEqual(["dora", "nis2"]);
	});

	it("jede Maßnahme liegt in genau einem Thema, jedes Thema ist belegt", () => {
		const groups = themeGroups();
		const codes = groups.flatMap((g) => g.controls.map((c) => c.code));
		expect(new Set(codes).size).toBe(codes.length);
		expect(codes.length).toBe(CONTROLS.length);
		for (const g of groups) expect(g.controls.length).toBeGreaterThan(0);
		expect(themeOf({ code: "CC-PRV-01", domain: "compliance" })).toBe(
			"privacy",
		);
	});

	it("Lage bleibt im Bild", () => {
		const l = mapLayout(CATALOG_FRAMEWORKS.map((f) => f.slug));
		expect(l.themes).toHaveLength(THEMES.length);
		for (const p of [...l.themes, ...l.frameworks]) {
			expect(p.x).toBeGreaterThan(0);
			expect(p.x).toBeLessThan(l.width);
			expect(p.y).toBeGreaterThan(0);
			expect(p.y).toBeLessThan(l.height);
		}
		const right = l.frameworks.find((f) => f.x > l.center.x + 100);
		expect(right?.anchor).toBe("start");
	});
});

describe("Beziehungen und Themen in einfacher Sprache", () => {
	const slugs = new Set(CATALOG_FRAMEWORKS.map((f) => f.slug));

	it("jede Beziehung zeigt auf Katalog-Rahmenwerke, ohne Doppel", () => {
		const keys = FRAMEWORK_RELATIONS.map((r) => `${r.from}|${r.to}`);
		expect(new Set(keys).size).toBe(keys.length);
		for (const r of FRAMEWORK_RELATIONS) {
			expect(slugs.has(r.from)).toBe(true);
			expect(slugs.has(r.to)).toBe(true);
			expect(r.from).not.toBe(r.to);
			expect(RELATION_KINDS).toContain(r.kind);
			plain(r.text);
		}
	});

	it("DORA geht vor NIS2, AMLR löst das GwG ab", () => {
		expect(
			relationsOf("nis2").some(
				(r) => r.from === "dora" && r.kind === "precedes",
			),
		).toBe(true);
		const amlr = CATALOG_FRAMEWORKS.find((f) => f.slug === "gwg");
		expect(
			FRAMEWORK_RELATIONS.some(
				(r) =>
					r.from === amlr?.successorSlug &&
					r.to === "gwg" &&
					r.kind === "replaces",
			),
		).toBe(true);
	});

	it("jedes Thema ist kurz erklärt", () => {
		for (const t of THEMES) {
			expect(THEME_INFO[t].short.length).toBeLessThanOrEqual(14);
			plain(THEME_INFO[t].simple);
		}
	});
});

describe("Kurznamen in der Übersicht", () => {
	it("jedes Rahmenwerk hat einen Namen mit höchstens 16 Zeichen", async () => {
		const { mapFrameworkName } = await import(
			"@/lib/compliance/framework-names"
		);
		const long = CATALOG_FRAMEWORKS.map((f) => mapFrameworkName(f.slug)).filter(
			(n) => n.length > 16,
		);
		expect(long).toEqual([]);
	});
});
