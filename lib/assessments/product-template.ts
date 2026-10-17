import type { AssessmentQuestion, ProductRole } from "@/db/schema/enums";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
} from "@/lib/compliance/catalog";
import { CRA_REQUIREMENTS, CRA_SECTIONS } from "@/lib/compliance/catalog/cra";

// CRA-Produktcheckliste: eine Frage je CRA-Anforderung, die das einzelne
// Produkt betrifft (Herstellerpflichten, Anhang I/II, Dokumentation,
// Konformität — für Einführer/Händler deren Prüfpflichten). Anders als die
// Gap-Analyse hängt keine Frage an einem Control: die Antworten gelten für
// dieses Produkt und setzen nie den Org-weiten Control-Status. Das tragende
// Control steht in mapsTo (Vorlagen, Hinweise).

export const PRODUCT_TEMPLATE = "cra-produkt";
export const PRODUCT_TEMPLATE_VERSION = "1";

// Schwachstellenfreiheit bei Auslieferung, SBOM und Meldeweg sind
// K.-o.-Punkte: ohne sie keine Konformität.
const CRITICAL = new Set(["AnhI-2a", "AnhI-II-1", "AnhI-II-5-6"]);
const MANUFACTURER_SECTIONS = new Set(["B", "C", "D", "E", "F", "G", "H"]);

export function productQuestions(role: ProductRole): AssessmentQuestion[] {
	const sections =
		role === "importer" || role === "distributor"
			? new Set(["I"])
			: MANUFACTURER_SECTIONS;
	const out: AssessmentQuestion[] = [];
	for (const s of [...CRA_SECTIONS].sort((a, b) => a.sortOrder - b.sortOrder)) {
		if (!sections.has(s.code)) continue;
		const reqs = CRA_REQUIREMENTS.filter((r) => r.sectionCode === s.code).sort(
			(a, b) => a.sortOrder - b.sortOrder,
		);
		for (const r of reqs) {
			if (
				r.appliesToRoles &&
				r.appliesToRoles.length > 0 &&
				!r.appliesToRoles.includes(role)
			)
				continue;
			const edges = EDGES_BY_REQUIREMENT.get(`cra:${r.code}`) ?? [];
			const primary =
				edges.find((e) => e.coverage === "full") ?? edges[0] ?? null;
			const control = primary ? CONTROL_BY_CODE.get(primary.control) : null;
			out.push({
				code: r.code,
				sectionCode: s.code,
				sectionTitle: s.title,
				text: r.title,
				help: r.requirementText,
				probes: r.auditQuestions?.slice(0, 3),
				requirements: [`cra:${r.code}`],
				frameworks: ["cra"],
				weight: 1,
				critical: CRITICAL.has(r.code) || undefined,
				evidenceRequired: true,
				evidenceHints: r.evidenceHints ?? control?.evidenceHints,
				templates: control?.templates,
				mapsTo: {
					requirement: `cra:${r.code}`,
					control: control?.code,
				},
			});
		}
	}
	return out;
}
