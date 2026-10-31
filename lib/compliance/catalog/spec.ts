import type {
	CatalogControlMapping,
	CatalogRequirement,
	ISODate,
} from "./types";

// Kompakte Schreibweise für Rahmenwerke ab Oktober 2026 (ISO 42001, TISAX,
// DPF, Cyber Essentials, Essential Eight …): Anforderung und Kanten an einer
// Stelle. Das erste Control deckt voll, weitere teilweise; `partial` macht
// auch das erste teilweise. So hat jede Anforderung mindestens eine Kante.

export type Spec = {
	code: string;
	section: string;
	title: string;
	text: string;
	domain: CatalogRequirement["domain"];
	controls: string[];
	partial?: boolean;
	note?: string;
	variants?: string[];
	questions?: string[];
	evidence?: string[];
	related?: `${string}:${string}`[];
	effectiveFrom?: ISODate;
};

export function buildIndex(
	slug: string,
	specs: readonly Spec[],
): { requirements: CatalogRequirement[]; edges: CatalogControlMapping[] } {
	const requirements: CatalogRequirement[] = specs.map((s, i) => ({
		code: s.code,
		sectionCode: s.section,
		title: s.title,
		requirementText: s.text,
		domain: s.domain,
		...(s.variants ? { variants: s.variants } : {}),
		...(s.questions ? { auditQuestions: s.questions } : {}),
		...(s.evidence ? { evidenceHints: s.evidence } : {}),
		...(s.related ? { relatedRequirements: s.related } : {}),
		...(s.effectiveFrom ? { effectiveFrom: s.effectiveFrom } : {}),
		sortOrder: (i + 1) * 10,
	}));
	const edges: CatalogControlMapping[] = specs.flatMap((s) =>
		s.controls.map((control, i) => ({
			control,
			requirement: `${slug}:${s.code}` as const,
			coverage:
				i === 0 && !s.partial ? ("full" as const) : ("partial" as const),
			...(s.note && i === 0 ? { note: s.note } : {}),
		})),
	);
	return { requirements, edges };
}
