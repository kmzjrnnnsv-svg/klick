import { describe, expect, it } from "vitest";
import { catalogQuestions } from "@/lib/assessments/catalog-template";
import { naAllowed } from "@/lib/assessments/na";
import { requiredControlCodes } from "@/lib/compliance/catalog-view";
import { controlRelations } from "@/lib/compliance/control-relations";
import { deriveCoverage } from "@/lib/compliance/coverage";
import { exclusionAllowedForKey, naImpact } from "@/lib/compliance/exclusions";
import { controlsByFramework } from "@/lib/compliance/framework-map";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import {
	buildOrgCatalog,
	type CustomCatalogInput,
	customApplicability,
	STATIC_CATALOG,
} from "@/lib/compliance/org-catalog";
import { invalidExclusionBlockers } from "@/lib/compliance/queries-readiness";
import { buildSheet } from "@/lib/evidence-studio/sheet";

// Katalog je Organisation (R4): Klick-Katalog plus eigene Rahmenwerke mit
// Slug `x-<key>`. Ohne eigene genau der statische Katalog; mit eigenen
// zählen sie in Abdeckung, Gap-Analyse, Nachweisbogen und Zusammenhängen.

function custom(
	over: Partial<CustomCatalogInput["framework"]> = {},
	reqOver: Partial<CustomCatalogInput["requirements"][number]> = {},
): CustomCatalogInput {
	return {
		framework: {
			id: "fw-1",
			key: "kunde-a",
			name: "Anforderungen der Kunde A GmbH",
			version: "2026",
			issuer: "Kunde A GmbH",
			description: "Sicherheitsanforderungen aus dem Rahmenvertrag",
			sourceUrl: null,
			status: "active",
			exclusionAllowed: false,
			exclusionLabel: null,
			copiedFrom: null,
			origin: "customer",
			activatedAt: new Date("2026-10-31T10:00:00Z"),
			activatedBy: "u-owner",
			createdBy: "u-editor",
			...over,
		},
		sections: [{ code: "A", title: "Zugriff", sortOrder: 0 }],
		requirements: [
			{
				id: "req-1",
				sectionCode: "A",
				code: "A.1",
				title: "Rechte vierteljährlich prüfen",
				text: "Zugriffsrechte werden vierteljährlich geprüft.",
				domain: "access",
				guidance: null,
				auditQuestions: ["Wann wurden die Rechte zuletzt geprüft?"],
				evidenceHints: ["Protokoll der letzten Rezertifizierung"],
				sortOrder: 0,
				excluded: false,
				exclusionReason: null,
				controls: [{ controlCode: "CC-IAM-05", coverage: "full", note: null }],
				...reqOver,
			},
			{
				id: "req-2",
				sectionCode: "A",
				code: "A.2",
				title: "Noch offen",
				text: "Noch keiner Maßnahme zugeordnet.",
				domain: "access",
				guidance: null,
				auditQuestions: [],
				evidenceHints: [],
				sortOrder: 1,
				excluded: false,
				exclusionReason: null,
				controls: [],
			},
		],
	};
}

const SLUG = "x-kunde-a";
const PROFILE = {
	sector: "other" as const,
	licenceStage: "0_vorbereitung" as const,
	caspServices: [],
	frameworks: [SLUG],
	tlptDesignated: false,
};

describe("buildOrgCatalog", () => {
	it("ohne eigene Rahmenwerke genau der statische Katalog", () => {
		expect(buildOrgCatalog([])).toBe(STATIC_CATALOG);
	});

	it("eigenes Rahmenwerk mit Schlüssel x-<key>:<code> und Kanten", () => {
		const cat = buildOrgCatalog([custom()]);
		expect(cat.frameworks.length).toBe(STATIC_CATALOG.frameworks.length + 1);
		expect(cat.frameworkBySlug.get(SLUG)?.name).toBe(
			"Anforderungen der Kunde A GmbH",
		);
		expect(cat.requirementByKey.get(`${SLUG}:A.1`)?.title).toBe(
			"Rechte vierteljährlich prüfen",
		);
		expect(cat.edgesByRequirement.get(`${SLUG}:A.1`)).toEqual([
			{ control: "CC-IAM-05", requirement: `${SLUG}:A.1`, coverage: "full" },
		]);
		expect(
			cat.edgesByControl
				.get("CC-IAM-05")
				?.some((e) => e.requirement === `${SLUG}:A.1`),
		).toBe(true);
		// Klick-Kanten bleiben
		expect(cat.edgesByControl.get("CC-IAM-05")?.length).toBeGreaterThan(1);
		expect(cat.activeCustomSlugs).toEqual([SLUG]);
		expect(cat.custom.get(SLUG)?.ownerUserId).toBe("u-owner");
	});

	it("Entwürfe stehen im Katalog, zählen aber nicht als eingeschaltet", () => {
		const cat = buildOrgCatalog([custom({ status: "draft" })]);
		expect(cat.frameworkBySlug.has(SLUG)).toBe(true);
		expect(cat.activeCustomSlugs).toEqual([]);
	});

	it("Name im Kurzformat aus dem Katalog der Org", () => {
		const cat = buildOrgCatalog([custom()]);
		expect(shortFrameworkName(SLUG)).toBe(SLUG);
		expect(shortFrameworkName(SLUG, cat)).toBe(
			"Anforderungen der Kunde A GmbH",
		);
		expect(shortFrameworkName("iso27001", cat)).toBe("ISO 27001");
	});
});

describe("Ausschluss eigener Anforderungen", () => {
	it("nur, wenn das Rahmenwerk ihn erlaubt", () => {
		const off = buildOrgCatalog([custom()]);
		const on = buildOrgCatalog([custom({ exclusionAllowed: true })]);
		expect(exclusionAllowedForKey(`${SLUG}:A.1`, off)).toBe(false);
		expect(exclusionAllowedForKey(`${SLUG}:A.1`, on)).toBe(true);
		// ohne Katalog kennt Klick das Rahmenwerk nicht
		expect(exclusionAllowedForKey(`${SLUG}:A.1`)).toBe(false);
		expect(naImpact([`${SLUG}:A.1`], on).excludable[0]?.label).toBe(
			"Anforderungen der Kunde A GmbH A.1",
		);
	});

	it("ausgeschlossene Anforderung gilt als nicht anwendbar, ohne Blocker", () => {
		const cat = buildOrgCatalog([
			custom(
				{ exclusionAllowed: true },
				{ excluded: true, exclusionReason: "Kein Fernzugriff vorhanden" },
			),
		]);
		const detail = customApplicability(cat);
		expect(detail.get(`${SLUG}:A.1`)).toEqual({
			applicable: false,
			source: "manual",
			note: "Kein Fernzugriff vorhanden",
		});
		expect(invalidExclusionBlockers(detail, [SLUG], cat).size).toBe(0);
		// ohne Katalog sähe die Prüfungsreife einen unzulässigen Ausschluss
		expect(invalidExclusionBlockers(detail, [SLUG]).size).toBe(1);
	});
});

describe("Abdeckung und Abläufe mit eigenem Rahmenwerk", () => {
	const cat = buildOrgCatalog([custom()]);

	it("Abdeckung folgt dem Stand der zugeordneten Maßnahme", () => {
		const base = {
			frameworks: [SLUG],
			requirements: cat.reqRefs,
			applicability: new Map<string, boolean>(),
			edges: cat.edgeRefs,
		};
		const open = deriveCoverage({ ...base, implStatus: new Map() });
		expect(open.byRequirement.get(`${SLUG}:A.1`)).toBe("open");
		expect(open.byRequirement.get(`${SLUG}:A.2`)).toBe("open");
		const done = deriveCoverage({
			...base,
			implStatus: new Map([["CC-IAM-05", "implemented"]]),
		});
		expect(done.byRequirement.get(`${SLUG}:A.1`)).toBe("covered");
		expect(done.byFramework.get(SLUG)?.covered).toBe(1);
	});

	it("Gap-Analyse: Frage je Control nennt die eigene Anforderung", () => {
		const qs = catalogQuestions({ ...PROFILE, catalog: cat });
		const q = qs.find((x) => x.controlCode === "CC-IAM-05");
		expect(q?.requirements).toEqual([`${SLUG}:A.1`]);
		expect(q?.frameworks).toEqual([SLUG]);
		// ohne Katalog der Org keine Frage
		expect(catalogQuestions(PROFILE)).toEqual([]);
		// „Nicht relevant“ nur mit erlaubtem Ausschluss
		if (q) {
			expect(naAllowed(q, cat)).toBe(false);
			expect(
				naAllowed(q, buildOrgCatalog([custom({ exclusionAllowed: true })])),
			).toBe(true);
		}
	});

	it("ausgeschlossene Anforderung fällt aus der Gap-Analyse", () => {
		const excluded = buildOrgCatalog([
			custom(
				{ exclusionAllowed: true },
				{ excluded: true, exclusionReason: "Kein Fernzugriff" },
			),
		]);
		expect(catalogQuestions({ ...PROFILE, catalog: excluded })).toEqual([]);
	});

	it("Arbeitsvorrat, Zusammenhänge und Nachweisbogen", () => {
		expect([...requiredControlCodes(PROFILE, new Map(), cat)]).toEqual([
			"CC-IAM-05",
		]);
		expect(
			controlsByFramework({ frameworks: [SLUG], catalog: cat }).get(SLUG),
		).toEqual(new Set(["CC-IAM-05"]));
		const rel = controlRelations("CC-IAM-05", {
			frameworks: [SLUG, "iso27001"],
			catalog: cat,
		});
		expect(rel.frameworks.map((f) => f.slug)).toContain(SLUG);
		expect(rel.frameworks.find((f) => f.slug === SLUG)?.name).toBe(
			"Anforderungen der Kunde A GmbH",
		);
		const sheet = buildSheet({
			controlCode: "CC-IAM-05",
			frameworks: [SLUG],
			today: "2026-10-31",
			catalog: cat,
		});
		expect(sheet?.requirements.map((r) => r.key)).toEqual([`${SLUG}:A.1`]);
		expect(
			sheet?.questions.some((q) =>
				q.sources.some(
					(s) => s.text === "Wann wurden die Rechte zuletzt geprüft?",
				),
			),
		).toBe(true);
	});
});
