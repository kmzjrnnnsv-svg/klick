import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import {
	ALL_REQUIREMENTS,
	CONTROL_BY_CODE,
	CONTROLS,
	EDGES_BY_REQUIREMENT,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import {
	EVIDENCE_KINDS,
	evidenceKindForHint,
	evidenceKindsForFrameworks,
	evidenceKindsForRequirement,
} from "@/lib/compliance/catalog/evidence-kinds";

// Nachweis-Werkstatt: jede Art muss auffindbar (Anforderung), zählbar
// (Control mit Kante zur Anforderung) und ausfüllbar (Route) sein.
describe("Nachweisarten", () => {
	it("Codes eindeutig, Felder vollständig", () => {
		const codes = EVIDENCE_KINDS.map((k) => k.code);
		expect(new Set(codes).size).toBe(codes.length);
		for (const k of EVIDENCE_KINDS) {
			expect(k.code, k.code).toMatch(/^NW-[A-Z0-9-]+$/);
			expect(k.requirements.length, k.code).toBeGreaterThan(0);
			expect(k.controls.length, k.code).toBeGreaterThan(0);
			expect(k.reviewMonths, k.code).toBeGreaterThan(0);
			if (k.scope === "per_entity") expect(k.entityType, k.code).toBeTruthy();
			if (k.template)
				expect(TEMPLATE_BY_CODE.has(k.template), k.template).toBe(true);
			for (const s of k.signers)
				expect(ROLE_FUNCTIONS as readonly string[]).toContain(s.function);
		}
	});

	it("jede Anforderung existiert und wird von einem Control der Art getragen", () => {
		for (const k of EVIDENCE_KINDS) {
			for (const c of k.controls)
				expect(CONTROL_BY_CODE.has(c), `${k.code} ${c}`).toBe(true);
			for (const r of k.requirements) {
				expect(REQUIREMENT_BY_KEY.has(r), `${k.code} ${r}`).toBe(true);
				const carriers = (EDGES_BY_REQUIREMENT.get(r) ?? []).map(
					(e) => e.control,
				);
				expect(
					k.controls.some((c) => carriers.includes(c)),
					`${k.code}: ${r} hat keinen tragenden Control in [${k.controls.join(", ")}]`,
				).toBe(true);
			}
		}
	});

	it("jeder Pflicht-Hinweis „(P)“ im Katalog hat eine Nachweisart", () => {
		const hints = [
			...ALL_REQUIREMENTS.flatMap((r) => r.evidenceHints ?? []),
			...CONTROLS.flatMap((c) => c.evidenceHints ?? []),
		].filter((h) => h.startsWith("(P)"));
		expect(hints.length).toBeGreaterThan(10);
		const missing = [...new Set(hints)].filter((h) => !evidenceKindForHint(h));
		expect(missing).toEqual([]);
	});

	it("Ausfüllen führt auf eine bestehende Seite", () => {
		for (const k of EVIDENCE_KINDS) {
			const seg = k.edit.href.split(/[?#]/)[0]?.split("/")[1] ?? "";
			expect(
				existsSync(join(process.cwd(), "app/(app)", seg)),
				`${k.code} → ${k.edit.href}`,
			).toBe(true);
		}
	});

	it("findet Arten je Anforderung und Rahmenwerk", () => {
		expect(
			evidenceKindsForRequirement("iso27001:4.3").map((k) => k.code),
		).toEqual(["NW-SCOPE"]);
		expect(
			evidenceKindsForRequirement("iso27001:9.2").map((k) => k.code),
		).toContain("NW-AUDITPROGRAMM");
		const dora = evidenceKindsForFrameworks(["dora"]).map((k) => k.code);
		expect(dora).toContain("NW-LEITLINIE");
		expect(dora).not.toContain("NW-SCOPE");
	});
});
