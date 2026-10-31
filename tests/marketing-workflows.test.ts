import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	busiestControl,
	catalogTotals,
	evidenceByIsoClause,
	pickerFrameworks,
} from "@/lib/marketing/catalog-facts";
import { addedControls, bestReuse, synergyOf } from "@/lib/marketing/synergy";
import {
	FEATURE_FAQ,
	PICKER_DEFAULT,
	PICKER_FRAMEWORKS,
	WORKFLOW_COUNT,
	WORKFLOW_GROUPS,
} from "@/lib/marketing/workflows";

// /funktionen: Inhalt vollständig, Zahlen aus dem Katalog, Bilder vorhanden.
// Du-Form prüft tests/du-form.test.ts für alle Dateien in lib/marketing.

const all = WORKFLOW_GROUPS.flatMap((g) => g.workflows);

describe("Abläufe auf /funktionen", () => {
	it("hat eindeutige Schlüssel für Bereiche und Abläufe", () => {
		const groups = WORKFLOW_GROUPS.map((g) => g.key);
		expect(new Set(groups).size).toBe(groups.length);
		const keys = all.map((w) => w.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("beschreibt jeden Ablauf mit Auslöser, Schritten und Ergebnis", () => {
		for (const w of all) {
			expect(w.name, w.key).not.toBe("");
			expect(w.summary, w.key).not.toBe("");
			expect(w.where, w.key).not.toBe("");
			expect(w.trigger, w.key).not.toBe("");
			expect(w.result, w.key).not.toBe("");
			expect(w.steps.length, w.key).toBeGreaterThanOrEqual(2);
			for (const s of w.steps) expect(s.trim(), w.key).not.toBe("");
		}
	});

	it("zählt die Abläufe richtig und bleibt überschaubar", () => {
		expect(WORKFLOW_COUNT).toBe(all.length);
		// Obergrenze für eine lesbare Seite; seit „Eigenes Rahmenwerk anlegen“ 56
		expect(all.length).toBeLessThanOrEqual(56);
		for (const g of WORKFLOW_GROUPS)
			expect(g.workflows.length).toBeGreaterThan(0);
	});

	it("verweist nur auf Bilder, die unter public/ liegen", () => {
		for (const g of WORKFLOW_GROUPS) {
			expect(g.image.src.startsWith("/"), g.key).toBe(true);
			expect(existsSync(join("public", g.image.src)), g.image.src).toBe(true);
			expect(g.image.alt, g.key).not.toBe("");
		}
	});

	it("nutzt keinen Gedankenstrich als Satzzeichen", () => {
		const texts = [
			...WORKFLOW_GROUPS.flatMap((g) => [g.title, g.lead]),
			...all.flatMap((w) => [w.summary, w.trigger, w.result, ...w.steps]),
			...FEATURE_FAQ.flatMap((f) => [f.q, f.a]),
		];
		expect(texts.filter((t) => t.includes(" — "))).toEqual([]);
	});
});

describe("Zahlen aus dem Katalog", () => {
	it("stimmen mit dem Katalog überein", () => {
		const t = catalogTotals();
		expect(t.frameworks).toBe(44);
		expect(t.requirements).toBe(1791);
		expect(t.controls).toBe(194);
		expect(t.edges).toBe(2965);
	});

	it("kennt jedes Rahmenwerk der Auswahl", () => {
		const fws = pickerFrameworks();
		expect(fws.map((f) => f.slug)).toEqual(
			PICKER_FRAMEWORKS.map((f) => f.slug),
		);
		for (const f of fws) {
			expect(f.requirements, f.slug).toBeGreaterThan(0);
			expect(f.controls.length, f.slug).toBeGreaterThan(0);
		}
		for (const s of PICKER_DEFAULT)
			expect(fws.some((f) => f.slug === s)).toBe(true);
	});

	it("findet ein Control, das mehrere Rahmenwerke abdeckt", () => {
		const c = busiestControl(["iso27001", "dora", "micar"]);
		expect(c).not.toBeNull();
		expect(c?.frameworks.length).toBeGreaterThan(1);
		expect(c?.requirements).toBeGreaterThan(1);
	});
});

describe("synergyOf", () => {
	const fws = [
		{ slug: "a", label: "A", requirements: 10, controls: ["C1", "C2", "C3"] },
		{ slug: "b", label: "B", requirements: 5, controls: ["C2", "C3", "C4"] },
		{ slug: "c", label: "C", requirements: 2, controls: ["C5"] },
	];

	it("rechnet gemeinsame Controls nur einmal", () => {
		expect(synergyOf(fws, ["a", "b"])).toEqual({
			requirements: 15,
			controls: 4,
			shared: 2,
			separate: 6,
		});
	});

	it("ist leer ohne Auswahl und ignoriert Unbekanntes", () => {
		expect(synergyOf(fws, [])).toEqual({
			requirements: 0,
			controls: 0,
			shared: 0,
			separate: 0,
		});
		expect(synergyOf(fws, ["c", "x"])).toEqual({
			requirements: 2,
			controls: 1,
			shared: 0,
			separate: 1,
		});
	});
});

describe("addedControls / bestReuse", () => {
	const fws = [
		{ slug: "a", label: "A", requirements: 10, controls: ["C1", "C2", "C3"] },
		{ slug: "b", label: "B", requirements: 5, controls: ["C2", "C3", "C4"] },
		{ slug: "c", label: "C", requirements: 2, controls: ["C5"] },
		{ slug: "d", label: "D", requirements: 4, controls: ["C1", "C6", "C7"] },
	];

	it("zählt je nicht gewähltem Rahmenwerk, was neu dazukäme", () => {
		const m = addedControls(fws, ["a"]);
		expect(m.has("a")).toBe(false);
		expect(m.get("b")).toEqual({ added: 1, reused: 2, total: 3 });
		expect(m.get("c")).toEqual({ added: 1, reused: 0, total: 1 });
		expect(m.get("d")).toEqual({ added: 2, reused: 1, total: 3 });
	});

	it("ohne Auswahl ist alles neu", () => {
		const m = addedControls(fws, []);
		for (const f of fws)
			expect(m.get(f.slug)).toEqual({
				added: f.controls.length,
				reused: 0,
				total: f.controls.length,
			});
	});

	it("nennt das Rahmenwerk mit dem größten schon abgedeckten Anteil", () => {
		expect(bestReuse(fws, ["a"])).toEqual({
			slug: "b",
			label: "B",
			reused: 2,
			total: 3,
		});
		expect(bestReuse(fws, [])).toBeNull();
		expect(bestReuse(fws, ["c"])).toBeNull();
		expect(bestReuse(fws, ["a", "b", "c", "d"])).toBeNull();
	});

	it("passt zum echten Katalog: ISO 27001 deckt einen Teil jedes Nachbarn", () => {
		const real = pickerFrameworks();
		const best = bestReuse(real, ["iso27001"]);
		expect(best).not.toBeNull();
		expect(best?.reused).toBeGreaterThan(0);
		expect(best?.reused).toBeLessThanOrEqual(best?.total ?? 0);
	});
});

describe("Beispiel je Rahmenwerk", () => {
	it("findet im echten Katalog Anforderungen mit mehreren Controls", () => {
		const real = pickerFrameworks();
		const micar = real.find((f) => f.slug === "micar");
		expect(micar?.example?.controls).toBeGreaterThan(1);
		expect(micar?.example?.code).toMatch(/^Art\. \d/);
		for (const f of real)
			if (f.example) expect(f.example.controls, f.slug).toBeGreaterThan(1);
	});
});

describe("Nachweise je Normpunkt", () => {
	it("jedes Kapitel 4–10 der ISO 27001 hat mindestens einen Nachweis aus Klick", () => {
		const clauses = evidenceByIsoClause();
		expect(clauses.map((c) => c.clause)).toEqual([
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
		]);
		for (const c of clauses) {
			expect(c.kinds.length, c.clause).toBeGreaterThan(0);
			expect(new Set(c.kinds).size, c.clause).toBe(c.kinds.length);
			expect(c.alsoFor, c.clause).not.toContain("ISO 27001");
		}
	});
});
