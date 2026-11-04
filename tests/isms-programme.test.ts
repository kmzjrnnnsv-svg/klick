import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIREMENT_BY_KEY } from "@/lib/compliance/catalog";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import {
	ISMS_ITEM_BY_KEY,
	ISMS_PROGRAMME,
	ISMS_SECTIONS,
} from "@/lib/compliance/catalog/isms-programme";
import {
	addRange,
	basisYear,
	ismsTree,
	itemWithChildren,
	rollupIsms,
} from "@/lib/isms-plan/rollup";
import { JARGON, sentences, words } from "./helpers/plain-language";

// ISMS-Jahresplan (P1): die Vorlage rechnet die Summen der Praxis-Vorlage
// nach (Gesamt ca. 225–336 PT, ISB A 135–212, B 215–334, Stellenanteil
// A 0,7–1,1 und B 1,1–1,7) und zeigt nur auf Dinge, die es in Klick gibt.

const round1 = (n: number) => Math.round(n * 10) / 10;

describe("Vorlage ISMS-Jahresplan", () => {
	it("hat eindeutige Schlüssel und gültige Unterpunkte", () => {
		expect(ISMS_ITEM_BY_KEY.size).toBe(ISMS_PROGRAMME.length);
		for (const i of ISMS_PROGRAMME) {
			if (!i.parent) continue;
			const parent = ISMS_ITEM_BY_KEY.get(i.parent);
			expect(parent, i.key).toBeDefined();
			expect(parent?.section, i.key).toBe(i.section);
		}
	});

	it("verweist nur auf Normpunkte, Vorlagen und Nachweisarten aus dem Katalog", () => {
		for (const i of ISMS_PROGRAMME) {
			expect(i.clauses.length, i.key).toBeGreaterThan(0);
			for (const c of i.clauses)
				expect(REQUIREMENT_BY_KEY.has(c), `${i.key} ${c}`).toBe(true);
			for (const t of i.templates ?? [])
				expect(TEMPLATE_BY_CODE.has(t), `${i.key} ${t}`).toBe(true);
			for (const e of i.evidence ?? [])
				expect(EVIDENCE_KIND_BY_CODE.has(e), `${i.key} ${e}`).toBe(true);
		}
	});

	it("führt auf Seiten, die es gibt", () => {
		for (const i of ISMS_PROGRAMME) {
			expect(i.where.length, i.key).toBeGreaterThan(0);
			for (const w of i.where) {
				const [path, query = ""] = w.href.split("?");
				const segs = (path ?? "").split("/").filter(Boolean);
				const dir = join(process.cwd(), "app/(app)", ...segs);
				// dynamische Segmente ([slug]) für Rahmenwerke
				const ok =
					existsSync(dir) ||
					existsSync(join(process.cwd(), "app/(app)", segs[0] ?? "", "[slug]"));
				expect(ok, w.href).toBe(true);
				const vorlage = new URLSearchParams(query).get("vorlage");
				if (vorlage) expect(TEMPLATE_BY_CODE.has(vorlage), w.href).toBe(true);
				expect(w.label.length).toBeGreaterThan(2);
			}
		}
	});

	it("hat Spannen mit min ≤ max und ISB-Anteile nicht über dem Gesamtaufwand", () => {
		for (const i of ISMS_PROGRAMME) {
			for (const r of [i.year, i.isb.a, i.isb.b, i.review, i.leadWeeks]) {
				if (!r) continue;
				expect(r[0], i.key).toBeLessThanOrEqual(r[1]);
				expect(r[0], i.key).toBeGreaterThanOrEqual(0);
			}
			expect(i.isb.a[1], i.key).toBeLessThanOrEqual(i.year[1]);
			expect(i.isb.b[1], i.key).toBeLessThanOrEqual(i.year[1]);
		}
	});

	it("rechnet den Aufwand je Jahr aus den Durchgängen nach", () => {
		for (const i of ISMS_PROGRAMME) {
			if (i.basis) expect(basisYear(i.basis), i.key).toEqual(i.year);
		}
		// 8 Risikoanalysen zu je 3–5 PT
		expect(ISMS_ITEM_BY_KEY.get("risk_analyses")?.year).toEqual([24, 40]);
		// Kennzahlen: viermal 5 PT erheben, einmal 2–3 PT auswerten
		expect(ISMS_ITEM_BY_KEY.get("kpis")?.year).toEqual([22, 23]);
	});

	it("schreibt Hinweise kurz und in Du-Form", () => {
		for (const i of ISMS_PROGRAMME) {
			if (!i.note) continue;
			expect(i.note, i.key).toMatch(/[.!?]$/);
			for (const s of sentences(i.note))
				expect(words(s), s).toBeLessThanOrEqual(20);
			for (const re of JARGON) expect(i.note, String(re)).not.toMatch(re);
			expect(i.note).not.toMatch(/\b(Sie|Ihre?[nmrs]?)\b/);
		}
	});
});

describe("rollupIsms", () => {
	const r = rollupIsms(ISMS_PROGRAMME);
	const by = Object.fromEntries(r.sections.map((s) => [s.section, s]));

	it("ergibt die Summen der Vorlage je Abschnitt", () => {
		expect(r.sections.map((s) => s.section)).toEqual([...ISMS_SECTIONS]);
		expect(by.policy).toMatchObject({
			year: [0.5, 1],
			isbA: [0.5, 1],
			isbB: [0.5, 1],
		});
		expect(by.framework).toMatchObject({
			year: [7.5, 13],
			isbA: [6.5, 10],
			isbB: [7.5, 13],
		});
		expect(by.guidelines).toMatchObject({
			year: [12, 19],
			isbA: [6, 9],
			isbB: [12, 19],
		});
		expect(by.procedures).toMatchObject({
			year: [25.5, 39.5],
			isbA: [13.5, 21],
			isbB: [25.5, 39.5],
		});
		expect(by.records).toMatchObject({
			year: [113, 160],
			isbA: [58, 90],
			isbB: [104, 158],
		});
		expect(by.operations).toMatchObject({
			year: [65, 103],
			isbA: [50, 81],
			isbB: [65, 103],
		});
	});

	it("ergibt Gesamt, ISB-Anteile und Stellenanteil", () => {
		expect(r.total).toEqual({
			year: [223.5, 335.5],
			isbA: [134.5, 212],
			isbB: [214.5, 333.5],
		});
		expect(r.middle).toBe(279.5);
		expect(r.workdays).toBe(200);
		expect(r.fte.a.map(round1)).toEqual([0.7, 1.1]);
		expect(r.fte.b.map(round1)).toEqual([1.1, 1.7]);
		// zzgl. 10–15 % für Interviews und Rückfragen in Szenario B
		expect(r.scenarioBExtra.map(round1)).toEqual([21.5, 50]);
	});

	it("rechnet mit anderen Arbeitstagen", () => {
		const half = rollupIsms(ISMS_PROGRAMME, { workdays: 100 });
		expect(half.fte.a[0]).toBeCloseTo(r.fte.a[0] * 2);
	});

	it("summiert einen Punkt mit seinen Unterpunkten", () => {
		// Verfahren 2–3 + BIA 5–10 + Kontakte 2 + Pläne 0 + Übungen 3–5
		expect(itemWithChildren("bcm", ISMS_PROGRAMME).year).toEqual([12, 20]);
		// Maßnahmen: 8–16 + 5–10 + 5–10 + 3–5 + 8–12 + 10–15
		expect(itemWithChildren("measures", ISMS_PROGRAMME).year).toEqual([39, 68]);
		expect(itemWithChildren("policy", ISMS_PROGRAMME).year).toEqual([0.5, 1]);
	});

	it("addiert halbe Tage ohne Rundungsfehler", () => {
		let acc: readonly [number, number] = [0, 0];
		for (let k = 0; k < 7; k++) acc = addRange(acc, [0.1, 0.2]);
		expect(acc).toEqual([0.7, 1.4]);
	});
});

describe("ismsTree", () => {
	it("hängt Unterpunkte an ihren Punkt, Rest als Wurzel", () => {
		const tree = ismsTree(ISMS_PROGRAMME);
		expect(tree.get("bcm")?.map((i) => i.key)).toEqual([
			"bia",
			"bcm_contacts",
			"bcm_plans",
			"bcm_exercise",
		]);
		expect(tree.get("roles")?.map((i) => i.key)).toEqual([
			"isb_appointment",
			"isb_concept",
		]);
		const roots = tree.get(null) ?? [];
		expect(roots.some((i) => i.key === "bia")).toBe(false);
		// fehlender Elternteil = Wurzel
		const orphan = ismsTree([{ key: "x", parent: "nope" }]);
		expect(orphan.get(null)?.map((i) => i.key)).toEqual(["x"]);
	});
});
