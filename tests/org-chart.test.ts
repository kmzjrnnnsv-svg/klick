import { describe, expect, it } from "vitest";
import { type FunctionKey, ROLE_FUNCTIONS } from "@/db/schema/enums";
import {
	APPOINTMENT_TEMPLATE_BY_FUNCTION,
	appointable,
} from "@/lib/compliance/catalog/appointment-templates";
import {
	buildOrgChart,
	type ChartAssignment,
	flattenChart,
	wouldCycle,
} from "@/lib/compliance/org-chart";
import { buildBestellung } from "@/lib/evidence-studio/kinds/bestellung";
import {
	buildOrganigramm,
	warningText,
} from "@/lib/evidence-studio/kinds/organigramm";
import type { DocBlock } from "@/lib/export/doc-model";

const a = (
	fn: ChartAssignment["function"],
	holder: string | null,
	reportsTo: ChartAssignment["reportsToFunction"] = null,
): ChartAssignment => ({
	function: fn,
	reportsToFunction: reportsTo,
	holder,
	deputy: null,
});

describe("Organigramm", () => {
	it("ohne Angabe direkt unter der Geschäftsleitung, mit Angabe darunter", () => {
		const { roots, warnings, size } = buildOrgChart([
			a("management_body", "Ada"),
			a("isb_ciso", "Ben"),
			a("incident_manager", "Cem", "isb_ciso"),
		]);
		expect(size).toBe(3);
		expect(warnings).toEqual([]);
		expect(roots.map((r) => r.function)).toEqual(["management_body"]);
		const flat = flattenChart(roots).map((x) => [x.node.function, x.depth]);
		expect(flat).toEqual([
			["management_body", 0],
			["isb_ciso", 1],
			["incident_manager", 2],
		]);
	});

	it("Unabhängigkeitsfunktion nicht direkt an der Leitung → Hinweis", () => {
		const { warnings } = buildOrgChart([
			a("management_body", "Ada"),
			a("department_head", "Dora"),
			a("aml_officer", "Gwen", "department_head"),
			a("dpo", "Dana", "department_head"),
		]);
		expect(warnings.map((w) => w.kind === "not_direct" && w.function)).toEqual([
			"aml_officer",
			"dpo",
		]);
		const w = warnings[0];
		expect(w && warningText(w)).toContain("§ 7 Abs. 5 GwG");
	});

	it("Kreis wird aufgelöst und gemeldet", () => {
		const { roots, warnings } = buildOrgChart([
			a("management_body", "Ada"),
			a("bcm_manager", "Bo", "incident_manager"),
			a("incident_manager", "Ina", "bcm_manager"),
		]);
		expect(warnings.some((w) => w.kind === "cycle")).toBe(true);
		// alles hängt wieder an der Leitung, nichts geht verloren
		expect(flattenChart(roots)).toHaveLength(3);
		expect(roots).toHaveLength(1);
	});

	it("Pflichtfunktion ohne Besetzung erscheint als nicht besetzt; ohne Leitung Hinweis", () => {
		const { roots, warnings } = buildOrgChart(
			[a("isb_ciso", "Ben")],
			["isb_ciso", "dpo"],
		);
		expect(warnings).toContainEqual({ kind: "no_management" });
		const dpo = flattenChart(roots).find((x) => x.node.function === "dpo");
		expect(dpo?.node.vacant).toBe(true);
	});
});

describe("Bestellungsschreiben", () => {
	it("Vorlage für jede bestellbare Funktion, nie für die Geschäftsleitung", () => {
		for (const f of ROLE_FUNCTIONS) {
			if (!appointable(f)) continue;
			const t = APPOINTMENT_TEMPLATE_BY_FUNCTION.get(f);
			expect(t, f).toBeDefined();
			expect(t?.tasks.length, f).toBeGreaterThan(0);
			if (t?.reportsDirectly) expect(t.independenceBasis, f).toBeTruthy();
		}
		expect(appointable("management_body")).toBe(false);
	});

	it("Text aus Funktion, Vorlage und Ergänzungen", () => {
		const t = APPOINTMENT_TEMPLATE_BY_FUNCTION.get("aml_officer");
		if (!t) throw new Error("Vorlage fehlt");
		const doc = buildBestellung({
			function: "aml_officer",
			holder: "Gwen Weber",
			external: false,
			deputy: "Ben Roth",
			appointedAt: "2026-11-01",
			reportsTo: "management_body",
			reportsDirectly: t.reportsDirectly,
			independenceBasis: t.independenceBasis ?? null,
			legalBasis: "§ 7 GwG · AMLR Art. 11",
			tasks: [...t.tasks],
			powers: [...t.powers],
			resources: t.resources,
			notes: "Zeitanteil 50 %",
		});
		const text = JSON.stringify(doc.blocks);
		expect(doc.title).toContain("Geldwäschebeauftragte");
		expect(text).toContain("Gwen Weber");
		expect(text).toContain("01.11.2026");
		expect(text).toContain("Berichtet unmittelbar an die Geschäftsleitung");
		expect(text).toContain("Zeitanteil 50 %");
	});
});

describe("Organigramm als Nachweis", () => {
	it("Tabelle mit Ebene und Berichtsweg, Hinweise als Liste", () => {
		const doc = buildOrganigramm({
			rows: [
				{
					function: "management_body",
					depth: 0,
					parent: null,
					holders: ["Ada"],
					deputies: [],
				},
				{
					function: "isb_ciso",
					depth: 1,
					parent: "management_body",
					holders: [],
					deputies: [],
				},
			],
			warnings: [{ kind: "no_management" }],
		});
		const table = doc.blocks[0] as Extract<DocBlock, { type: "table" }>;
		expect(table.rows[1]).toEqual([
			"2",
			"Informationssicherheitsbeauftragte:r (ISB/CISO)",
			"nicht besetzt",
			"",
			"Leitungsorgan / Geschäftsleitung",
		]);
		expect(doc.blocks.some((b) => b.type === "list")).toBe(true);
	});
});

describe("wouldCycle", () => {
	const ID = "6f1d3c2a-9b8e-4c7d-a1f0-2e3b4c5d6e7f";
	const parents = new Map<FunctionKey, FunctionKey | null>([
		["management_body", null],
		["risk_control", "management_body"],
		[`role:${ID}`, "risk_control"],
	]);
	it("erkennt Kreise und Selbstbezug", () => {
		expect(wouldCycle(parents, "risk_control", `role:${ID}`)).toBe(true);
		expect(wouldCycle(parents, "risk_control", "risk_control")).toBe(true);
		expect(wouldCycle(parents, "management_body", "risk_control")).toBe(true);
	});
	it("erlaubt Bäume", () => {
		expect(wouldCycle(parents, `role:${ID}`, "management_body")).toBe(false);
		expect(wouldCycle(parents, "dpo", `role:${ID}`)).toBe(false);
		expect(wouldCycle(parents, "dpo", null)).toBe(false);
	});
});
