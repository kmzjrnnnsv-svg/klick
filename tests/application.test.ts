import { describe, expect, it } from "vitest";
import {
	type ApplicationFacts,
	evaluateApplication,
} from "@/lib/compliance/application";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { DOCUMENT_TEMPLATES } from "@/lib/compliance/catalog/document-templates";
import { MICAR_APPLICATION } from "@/lib/compliance/catalog/micar-application";
import { ZAG_APPLICATION } from "@/lib/compliance/catalog/zag-application";

const empty: ApplicationFacts = {
	documents: [],
	controls: new Map(),
	functions: new Set(),
	ownFundsApproved: false,
	amlAnalysisApproved: false,
	providers: [],
	processes: 0,
	shareholders: 0,
	cryptoAssets: 0,
	scopes: new Set(),
	manualDone: new Set(),
};

describe("application dossier", () => {
	it("Seeds: Codes eindeutig, Controls und Vorlagen auflösbar", () => {
		const templates = new Set(DOCUMENT_TEMPLATES.map((t) => t.code));
		for (const list of [MICAR_APPLICATION, ZAG_APPLICATION]) {
			const codes = list.map((i) => i.code);
			expect(new Set(codes).size).toBe(codes.length);
			for (const item of list) {
				expect(item.checks.length).toBeGreaterThan(0);
				for (const c of item.checks) {
					if (c.kind === "controls")
						for (const code of c.codes)
							expect(CONTROL_BY_CODE.has(code), `${item.code} → ${code}`).toBe(
								true,
							);
					if (c.kind === "documents")
						for (const code of c.templateCodes)
							expect(templates.has(code), `${item.code} → ${code}`).toBe(true);
				}
			}
		}
		expect(MICAR_APPLICATION.length).toBeGreaterThanOrEqual(15);
		expect(ZAG_APPLICATION.length).toBeGreaterThanOrEqual(9);
	});

	it("leere Org: alles offen, Dienste-abhängige Bestandteile N/A", () => {
		const r = evaluateApplication(MICAR_APPLICATION, empty, ["transfer"]);
		expect(r.completenessPct).toBe(0);
		const custody = r.items.find((i) => i.item.code === "MA-13");
		expect(custody?.status).toBe("not_applicable");
		const platform = r.items.find((i) => i.item.code === "MA-14");
		expect(platform?.status).toBe("not_applicable");
		expect(r.applicable).toBe(MICAR_APPLICATION.length - 2);
	});

	it("#3 Eigenmittel grün sobald ein freigegebener Lauf existiert; #12 GwG partial ohne GWB", () => {
		const facts: ApplicationFacts = {
			...empty,
			ownFundsApproved: true,
			amlAnalysisApproved: true,
			controls: new Map([
				["CC-CAP-01", "implemented"],
				["CC-AML-02", "implemented"],
				["CC-AML-04", "in_progress"],
			]),
		};
		const r = evaluateApplication(MICAR_APPLICATION, facts, ["transfer"]);
		expect(r.items.find((i) => i.item.code === "MA-03")?.status).toBe("done");
		const aml = r.items.find((i) => i.item.code === "MA-12");
		expect(aml?.status).toBe("partial");
		expect(aml?.checks.map((c) => c.status)).toEqual([
			"done",
			"open",
			"partial",
		]);
		expect(r.completenessPct).toBeGreaterThan(0);
	});

	it("Dokument-Check: approved zählt, Entwurf ist partial; manuell abgehakt zählt", () => {
		const facts: ApplicationFacts = {
			...empty,
			documents: [
				{ templateCode: "RL-BESCHWERDEN", status: "draft" },
				{ templateCode: "KZ-KUNDENVERMOEGEN", status: "published" },
			],
			controls: new Map([
				["CC-CND-05", "implemented"],
				["CC-CUS-01", "implemented"],
				["CC-CUS-03", "implemented"],
			]),
			manualDone: new Set(["MA-01"]),
		};
		const r = evaluateApplication(MICAR_APPLICATION, facts, ["transfer"]);
		expect(r.items.find((i) => i.item.code === "MA-09")?.status).toBe(
			"partial",
		);
		expect(r.items.find((i) => i.item.code === "MA-08")?.status).toBe("done");
		expect(r.items.find((i) => i.item.code === "MA-01")?.status).toBe("done");
	});
});
