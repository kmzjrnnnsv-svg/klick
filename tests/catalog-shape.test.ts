import { describe, expect, it } from "vitest";
import { DOMAINS } from "@/db/schema/enums";
import {
	ALL_REQUIREMENTS,
	CATALOG_FRAMEWORKS,
	CONTROLS,
	EDGES,
	EDGES_BY_REQUIREMENT,
	frameworksWithIndex,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { BASELINE } from "@/lib/compliance/catalog/baseline";

// Form des Katalogs: eindeutige Codes, jede Anforderung (nicht aufgehoben)
// hat ≥ 1 Kante, jede Kante ist auflösbar, jeder Querverweis zeigt auf eine
// existierende Anforderung, jede Baseline-Zeile auf ein Control.

describe("catalog shape", () => {
	it("Rahmenwerke mit Index: ISO 27001, DORA, NIS2", () => {
		const slugs = frameworksWithIndex().map((f) => f.slug);
		expect(slugs).toEqual(expect.arrayContaining(["iso27001", "dora", "nis2"]));
		const iso = CATALOG_FRAMEWORKS.find((f) => f.slug === "iso27001");
		expect(iso?.requirements.length).toBe(118);
		expect(iso?.sections.length).toBe(11);
	});

	it("Codes sind je Rahmenwerk eindeutig, Sections aufgelöst, Domänen gültig", () => {
		for (const f of frameworksWithIndex()) {
			const codes = f.requirements.map((r) => r.code);
			expect(new Set(codes).size, f.slug).toBe(codes.length);
			const sections = new Set(f.sections.map((s) => s.code));
			for (const r of f.requirements) {
				expect(sections.has(r.sectionCode), `${f.slug}:${r.code} section`).toBe(
					true,
				);
				expect(DOMAINS as readonly string[]).toContain(r.domain);
			}
		}
	});

	it("Control-Codes eindeutig, Format CC-XXX-NN, ≥ 100 Controls", () => {
		const codes = CONTROLS.map((c) => c.code);
		expect(new Set(codes).size).toBe(codes.length);
		expect(codes.length).toBeGreaterThanOrEqual(100);
		for (const c of codes) expect(c).toMatch(/^CC-[A-Z]{2,4}-\d{2}$/);
	});

	it("jede Kante ist auflösbar (Control und Anforderung existieren)", () => {
		const controlCodes = new Set<string>(CONTROLS.map((c) => c.code));
		const bad = EDGES.filter(
			(e) =>
				!controlCodes.has(e.control) || !REQUIREMENT_BY_KEY.has(e.requirement),
		).map((e) => `${e.control} → ${e.requirement}`);
		expect(bad).toEqual([]);
	});

	it("jede nicht aufgehobene Anforderung hat ≥ 1 Kante", () => {
		const missing = ALL_REQUIREMENTS.filter(
			(r) =>
				r.legalStatus !== "repealed" &&
				!EDGES_BY_REQUIREMENT.has(`${r.framework}:${r.code}`),
		).map((r) => `${r.framework}:${r.code}`);
		expect(missing).toEqual([]);
	});

	it("keine doppelten Kanten", () => {
		const keys = EDGES.map((e) => `${e.control}|${e.requirement}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("jedes Control erfüllt mindestens eine Anforderung", () => {
		const used = new Set(EDGES.map((e) => e.control));
		const orphan = CONTROLS.filter((c) => !used.has(c.code)).map((c) => c.code);
		expect(orphan).toEqual([]);
	});

	it("Querverweise (relatedRequirements) sind auflösbar und zeigen auf andere Rahmenwerke", () => {
		const bad: string[] = [];
		for (const r of ALL_REQUIREMENTS) {
			for (const ref of r.relatedRequirements ?? []) {
				if (!REQUIREMENT_BY_KEY.has(ref))
					bad.push(`${r.framework}:${r.code} → ${ref}`);
				if (ref.startsWith(`${r.framework}:`))
					bad.push(`${r.framework}:${r.code} → ${ref} (gleiches Rahmenwerk)`);
			}
		}
		expect(bad).toEqual([]);
	});

	it("Synergie ist real: ≥ 40 Controls erfüllen Anforderungen aus ≥ 2 Rahmenwerken", () => {
		const perControl = new Map<string, Set<string>>();
		for (const e of EDGES) {
			const fw = e.requirement.slice(0, e.requirement.indexOf(":"));
			const set = perControl.get(e.control) ?? new Set<string>();
			set.add(fw);
			perControl.set(e.control, set);
		}
		const multi = [...perControl.values()].filter((s) => s.size >= 2).length;
		expect(multi).toBeGreaterThanOrEqual(40);
	});

	it("Baseline referenziert nur existierende Controls, keine Dubletten", () => {
		const codes = new Set<string>(CONTROLS.map((c) => c.code));
		const bad = BASELINE.controls
			.filter((b) => !codes.has(b.code))
			.map((b) => b.code);
		expect(bad).toEqual([]);
		const list = BASELINE.controls.map((b) => b.code);
		expect(new Set(list).size).toBe(list.length);
	});
});
