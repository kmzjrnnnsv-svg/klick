import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Eigene Rahmenwerke (R4) zählen nur, wo der Katalog der Org gelesen wird
// (cov.catalog bzw. loadOrgCatalog). Diese Org-Flows dürfen die statischen
// Kataloglisten nicht direkt nutzen — sonst fallen eigene Rahmenwerke dort
// still heraus. Ausnahmen nur mit Begründung.

const STATIC = [
	"ALL_REQUIREMENTS",
	"EDGES",
	"EDGES_BY_REQUIREMENT",
	"EDGES_BY_CONTROL",
	"REQUIREMENT_BY_KEY",
	"FRAMEWORK_BY_SLUG",
	"CATALOG_FRAMEWORKS",
	"CATALOG_REQ_REFS",
	"CATALOG_EDGES",
] as const;

const FLOWS: Record<
	string,
	Partial<Record<(typeof STATIC)[number], string>>
> = {
	"lib/compliance/queries.ts": {},
	"lib/compliance/queries-readiness.ts": {
		REQUIREMENT_BY_KEY:
			"Rückfall in invalidExclusionBlockers, wenn kein Katalog übergeben wird",
	},
	"lib/assessments/create-service.ts": {},
	"lib/export/builders.ts": {
		EDGES_BY_REQUIREMENT: "SoA gibt es nur für ISO 27001 (Annex A)",
		FRAMEWORK_BY_SLUG: "SoA gibt es nur für ISO 27001 (Annex A)",
	},
	"app/(app)/rahmenwerke/page.tsx": {},
	"app/(app)/rahmenwerke/[slug]/page.tsx": {},
	"app/(app)/rahmenwerke/[slug]/[code]/page.tsx": {},
	"app/(app)/gap-analyse/page.tsx": {
		FRAMEWORK_BY_SLUG:
			"nur für die Klick-Rahmenwerke aus listOrgFrameworks; eigene kommen aus cov.catalog",
	},
	"app/(app)/gap-analyse/[id]/page.tsx": {},
	"app/(app)/zusammenhaenge/page.tsx": {},
	"app/(app)/controls/page.tsx": {},
	"app/(app)/controls/[code]/page.tsx": {},
	"app/(app)/ueberblick/page.tsx": {},
	"app/(app)/synergien/page.tsx": {
		ALL_REQUIREMENTS:
			"Querverweise (relatedRequirements) gibt es nur im Klick-Katalog",
	},
	"app/actions/controls.ts": {
		REQUIREMENT_BY_KEY: "Rückfall, wenn keine Abdeckung geladen ist",
	},
};

describe("Org-Flows lesen den Katalog der Org (R4)", () => {
	for (const [file, allowed] of Object.entries(FLOWS)) {
		it(file, () => {
			const src = readFileSync(file, "utf8");
			const used = STATIC.filter((id) =>
				new RegExp(`\\b${id}\\b`).test(src),
			).filter((id) => !(id in allowed));
			expect(used).toEqual([]);
		});
	}

	it("orgCoverage lädt den Katalog der Org", () => {
		const src = readFileSync("lib/compliance/queries.ts", "utf8");
		expect(src).toMatch(/loadOrgCatalog\(tx, orgId\)/);
		expect(src).toMatch(/requirements: catalog\.reqRefs/);
		expect(src).toMatch(/edges: catalog\.edgeRefs/);
	});

	it("Trust Center zeigt keine eigenen Rahmenwerke", () => {
		const src = readFileSync("lib/trust/service.ts", "utf8");
		expect(src).toMatch(/filter\(\(s\) => !isCustomSlug\(s\)\)/);
	});
});
