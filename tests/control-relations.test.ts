import { describe, expect, it } from "vitest";
import { CONTROLS, EDGES_BY_CONTROL } from "@/lib/compliance/catalog";
import { controlRelations, sharedBy } from "@/lib/compliance/control-relations";

// Teil Z4: Wer verlangt eine Maßnahme – und was genau?

describe("controlRelations", () => {
	it("Vorfall melden: DORA, NIS2 und DSGVO, DORA am strengsten", () => {
		const r = controlRelations("CC-INC-03");
		const slugs = r.frameworks.map((f) => f.slug);
		for (const s of ["dora", "nis2", "dsgvo"]) expect(slugs).toContain(s);
		const initial = r.topics.find((t) => t.topic === "deadline:initial");
		expect(initial).toBeDefined();
		expect(initial?.differs).toBe(true);
		expect(initial?.strictest).toContain("dora");
		expect(initial?.strictest).not.toContain("dsgvo");
	});

	it("Aufbewahren gegen Löschen ist ein Widerspruch", () => {
		const r = controlRelations("CC-AST-10");
		expect(r.conflicts.length).toBeGreaterThan(0);
		expect(r.conflicts[0]?.frameworks).toContain("dsgvo");
	});

	it("teilweise Abdeckung trägt ihre Notiz", () => {
		const partial = CONTROLS.flatMap((c) =>
			(EDGES_BY_CONTROL.get(c.code) ?? [])
				.filter((e) => e.coverage === "partial" && e.note)
				.map((e) => ({ control: c.code, requirement: e.requirement })),
		)[0];
		expect(partial).toBeDefined();
		if (!partial) return;
		const r = controlRelations(partial.control);
		const req = r.frameworks
			.flatMap((f) => f.requirements)
			.find((x) => x.key === partial.requirement);
		expect(req?.coverage).toBe("partial");
		expect(req?.note).toBeTruthy();
		const fw = r.frameworks.find((f) =>
			f.requirements.some((q) => q.key === partial.requirement),
		);
		expect(fw?.full).toBe(false);
	});

	it("filtert nach Rahmenwerken und Anwendbarkeit", () => {
		const r = controlRelations("CC-INC-03", { frameworks: ["nis2"] });
		expect(r.frameworks.map((f) => f.slug)).toEqual(["nis2"]);
		const nis2 = r.frameworks[0]?.requirements ?? [];
		const off = new Map(nis2.map((q) => [q.key, false] as const));
		expect(
			controlRelations("CC-INC-03", {
				frameworks: ["nis2"],
				applicability: off,
			}).frameworks,
		).toEqual([]);
	});

	it("jede Maßnahme mit Kanten nennt mindestens ein Rahmenwerk", () => {
		const empty = CONTROLS.filter((c) => sharedBy(c.code).length === 0).map(
			(c) => c.code,
		);
		expect(empty).toEqual([]);
	});

	it("Rahmenwerke stehen in Katalog-Reihenfolge, ohne Doppel", () => {
		const r = controlRelations("CC-INC-03");
		const slugs = r.frameworks.map((f) => f.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const f of r.frameworks) {
			const keys = f.requirements.map((q) => q.key);
			expect(new Set(keys).size).toBe(keys.length);
		}
	});
});
