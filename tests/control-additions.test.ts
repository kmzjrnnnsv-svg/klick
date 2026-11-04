import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CONTROL_BY_CODE,
	EDGES,
	EDGES_BY_CONTROL,
	REQUIREMENT_BY_KEY,
	splitRequirementKey,
} from "@/lib/compliance/catalog";
import {
	CONTROL_ADDITIONS,
	type KlickPlace,
} from "@/lib/compliance/catalog/control-additions";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import {
	additionLines,
	controlAdditions,
} from "@/lib/compliance/control-additions";
import { JARGON, sentences, words } from "./helpers/plain-language";

// Teil K: Kern und Zusätze je Maßnahme. Jeder Zusatz zeigt auf echte
// Anforderungen, die genau diese Maßnahme trägt, und auf eine Seite in Klick,
// die es gibt. Texte in einfacher Sprache.

const ENTRIES = Object.entries(CONTROL_ADDITIONS);

// Maßnahmen, die mindestens zehn Rahmenwerke verlangen
const SHARED = (() => {
	const fws = new Map<string, Set<string>>();
	for (const e of EDGES) {
		const set = fws.get(e.control) ?? new Set<string>();
		set.add(splitRequirementKey(e.requirement).framework);
		fws.set(e.control, set);
	}
	return [...fws].filter(([, s]) => s.size >= 10).map(([c]) => c);
})();

function plain(text: string) {
	expect(text.trim()).toBe(text);
	expect(text).toMatch(/[.!?]$/);
	for (const s of sentences(text)) expect(words(s), s).toBeLessThanOrEqual(20);
	for (const re of JARGON) expect(text, String(re)).not.toMatch(re);
	expect(text).not.toMatch(/\b(Sie|Ihre?[nmrs]?)\b/);
}

function placeExists(place: KlickPlace) {
	const [path, query = ""] = place.href.split("?");
	const seg = path?.split("/")[1] ?? "";
	expect(existsSync(join(process.cwd(), "app/(app)", seg)), place.href).toBe(
		true,
	);
	const vorlage = new URLSearchParams(query).get("vorlage");
	if (vorlage) expect(TEMPLATE_BY_CODE.has(vorlage), place.href).toBe(true);
	expect(place.label.length).toBeGreaterThan(2);
}

describe("Kern und Zusätze je Maßnahme", () => {
	it("gibt es nur für bestehende Maßnahmen", () => {
		expect(
			ENTRIES.filter(([code]) => !CONTROL_BY_CODE.has(code)).map(([c]) => c),
		).toEqual([]);
	});

	it("deckt die meistgeteilten Maßnahmen ab", () => {
		expect(SHARED.length).toBe(60);
		const covered = SHARED.filter((c) => CONTROL_ADDITIONS[c]);
		// K1: die 15 meistgeteilten; K2 hebt auf alle 60
		expect(covered.length).toBeGreaterThanOrEqual(15);
	});

	it.each(ENTRIES)("%s: Fundstellen sind Kanten dieser Maßnahme", (code, e) => {
		const keys = new Set(
			(EDGES_BY_CONTROL.get(code) ?? []).map((x) => x.requirement),
		);
		expect(e.additions.length).toBeGreaterThan(0);
		for (const a of e.additions) {
			expect(a.requirements.length, a.text).toBeGreaterThan(0);
			for (const key of a.requirements) {
				expect(REQUIREMENT_BY_KEY.has(key), `${code} → ${key}`).toBe(true);
				expect(keys.has(key), `${code} trägt ${key} nicht`).toBe(true);
			}
			expect(new Set(a.requirements).size).toBe(a.requirements.length);
		}
		const texts = e.additions.map((a) => a.text);
		expect(new Set(texts).size).toBe(texts.length);
	});

	it.each(ENTRIES)("%s: einfache Sprache, Orte in Klick gibt es", (_c, e) => {
		plain(e.core);
		if (e.where) placeExists(e.where);
		for (const a of e.additions) {
			plain(a.text);
			expect(sentences(a.text).length).toBeLessThanOrEqual(2);
			if (a.where) placeExists(a.where);
		}
	});

	it("zeigt nur, was für die Organisation gilt", () => {
		const all = controlAdditions("CC-HR-03");
		const iso = controlAdditions("CC-HR-03", { frameworks: ["iso27001"] });
		const pci = controlAdditions("CC-HR-03", { frameworks: ["pci-dss"] });
		expect(all.core).toBeTruthy();
		// ISO 27001 trägt keinen der gepflegten Zusätze
		expect(iso.groups).toEqual([]);
		expect(iso.hidden).toBe(CONTROL_ADDITIONS["CC-HR-03"]?.additions.length);
		// PCI: Phishing-Inhalt, Entwickler:innen, jährlich, aber kein Geldwäsche-Inhalt
		const texts = additionLines(pci).map((l) => l.text);
		expect(texts.some((t) => /Phishing/.test(t))).toBe(true);
		expect(texts.some((t) => /Geldwäsche/.test(t))).toBe(false);
		for (const l of additionLines(pci)) expect(l.names).toHaveLength(1);
	});

	it("blendet ausgeschlossene Anforderungen aus", () => {
		const view = controlAdditions("CC-HR-03", {
			frameworks: ["pci-dss"],
			applicability: new Map([["pci-dss:6.2.2", false]]),
		});
		const lines = additionLines(view);
		expect(lines.some((l) => /entwickelt/.test(l.text))).toBe(false);
	});

	it("ohne Eintrag gibt es keinen Kern", () => {
		const any = [...CONTROL_BY_CODE.keys()].find((c) => !CONTROL_ADDITIONS[c]);
		if (any) expect(controlAdditions(any).core).toBeNull();
	});
});
