import { describe, expect, it } from "vitest";
import {
	CATALOG_EDGES,
	CATALOG_REQ_REFS,
	profileApplicability,
	requiredControlCodes,
} from "@/lib/compliance/catalog-view";
import { frameworkRemovalImpact } from "@/lib/compliance/framework-removal";

const profile = {
	sector: "other" as const,
	licenceStage: "0_vorbereitung" as const,
	caspServices: [],
};

function impact(
	slug: string,
	active: string[],
	openAudits: { id: string; title: string; frameworkIds: string[] }[] = [],
) {
	return frameworkRemovalImpact({
		slug,
		activeSlugs: active,
		licenceStage: profile.licenceStage,
		requirements: CATALOG_REQ_REFS,
		edges: CATALOG_EDGES,
		applicability: profileApplicability({ ...profile, frameworks: active }),
		implStatus: new Map([["CC-GOV-01", "implemented"]]),
		openAudits,
	});
}

describe("frameworkRemovalImpact", () => {
	it("NIS2 neben ISO: Anforderungen fallen weg, geteilte Controls bleiben", () => {
		const r = impact("nis2", ["iso27001", "nis2"]);
		expect(r.requirements).toBeGreaterThan(0);
		expect(r.controlsShared).toBeGreaterThan(0);
		expect(r.canRemove).toBe(true);
		// was ISO auch fordert, ist nie „nur hier“
		const isoOnly = requiredControlCodes(
			{ ...profile, frameworks: ["iso27001"] },
			new Map(),
		);
		for (const c of r.controlsOnlyHere) expect(isoOnly.has(c)).toBe(false);
	});

	it("letztes Rahmenwerk lässt sich nicht entfernen", () => {
		const r = impact("iso27001", ["iso27001"]);
		expect(r.lastFramework).toBe(true);
		expect(r.canRemove).toBe(false);
	});

	it("laufendes Audit auf das Rahmenwerk sperrt", () => {
		const r = impact(
			"nis2",
			["iso27001", "nis2"],
			[
				{ id: "a1", title: "NIS2-Audit", frameworkIds: ["nis2"] },
				{ id: "a2", title: "ISO-Audit", frameworkIds: ["iso27001"] },
			],
		);
		expect(r.blockingAudits).toEqual([{ id: "a1", title: "NIS2-Audit" }]);
		expect(r.canRemove).toBe(false);
	});

	it("DORA entfernen: Pflichten/Funktionen nur von DORA fallen weg", () => {
		const r = impact("dora", ["iso27001", "dora"]);
		expect(r.obligations.length + r.functions.length).toBeGreaterThan(0);
		const again = impact("iso27001", ["iso27001", "dora"]);
		// ISO entfernen nimmt DORA-Pflichten nicht mit
		for (const o of again.obligations)
			expect(r.obligations.map((x) => x.code)).not.toContain(o.code);
	});
});

describe("requiredControlCodes", () => {
	it("manuelle N/A-Entscheidung nimmt Controls nur heraus, wenn sonst nichts sie fordert", () => {
		const all = requiredControlCodes(
			{ ...profile, frameworks: ["iso27001"] },
			new Map(),
		);
		expect(all.size).toBeGreaterThan(50);
		const isoKeys = CATALOG_REQ_REFS.filter((r) => r.framework === "iso27001");
		const allNa = new Map(
			isoKeys.map((r) => [`${r.framework}:${r.code}`, false] as const),
		);
		expect(
			requiredControlCodes({ ...profile, frameworks: ["iso27001"] }, allNa)
				.size,
		).toBe(0);
	});
});
