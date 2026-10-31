import type { CustomFramework } from "@/db/schema/custom-frameworks";
import { customSlug } from "@/lib/custom-frameworks/rules";
import {
	ALL_REQUIREMENTS,
	CATALOG_FRAMEWORKS,
	type CatalogControlMapping,
	type CatalogFramework,
	type CatalogRequirement,
	EDGES,
	EDGES_BY_CONTROL,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "./catalog";
import { CATALOG_EDGES, CATALOG_REQ_REFS } from "./catalog-view";
import type { Edge, ReqRef } from "./coverage";

// Katalog je Organisation (R4): der statische Klick-Katalog plus die eigenen
// Rahmenwerke der Org (Slug `x-<key>`). Rein — die Daten lädt
// loadOrgCatalog (org-catalog-server.ts). Ohne eigene Rahmenwerke sind es
// genau die statischen Objekte, ohne Kopie.

export type CustomCatalogInput = {
	framework: Pick<
		CustomFramework,
		| "id"
		| "key"
		| "name"
		| "version"
		| "issuer"
		| "description"
		| "sourceUrl"
		| "status"
		| "exclusionAllowed"
		| "exclusionLabel"
		| "copiedFrom"
		| "origin"
		| "activatedAt"
		| "activatedBy"
		| "createdBy"
	>;
	sections: { code: string; title: string; sortOrder: number }[];
	requirements: {
		id: string;
		sectionCode: string;
		code: string;
		title: string;
		text: string;
		domain: CatalogRequirement["domain"];
		guidance: string | null;
		auditQuestions: string[];
		evidenceHints: string[];
		sortOrder: number;
		excluded: boolean;
		exclusionReason: string | null;
		controls: {
			controlCode: string;
			coverage: "full" | "partial";
			note: string | null;
		}[];
	}[];
};

export type CustomInfo = {
	id: string;
	status: CustomFramework["status"];
	copiedFrom: string | null;
	origin: CustomFramework["origin"];
	activatedAt: Date | null;
	// Verantwortlich in der Liste: wer eingeschaltet hat, sonst wer anlegte
	ownerUserId: string | null;
	// Ausgeschlossene Anforderungen (Code → Begründung)
	excluded: ReadonlyMap<string, string>;
	// Code → Zeilen-ID (für Actions)
	requirementIds: ReadonlyMap<string, string>;
};

export type OrgCatalog = {
	frameworks: readonly CatalogFramework[];
	frameworkBySlug: ReadonlyMap<string, CatalogFramework>;
	requirements: readonly (CatalogRequirement & { framework: string })[];
	requirementByKey: ReadonlyMap<
		string,
		CatalogRequirement & { framework: string }
	>;
	edges: readonly CatalogControlMapping[];
	edgesByRequirement: ReadonlyMap<string, CatalogControlMapping[]>;
	edgesByControl: ReadonlyMap<string, CatalogControlMapping[]>;
	reqRefs: readonly ReqRef[];
	edgeRefs: readonly Edge[];
	// eigene Rahmenwerke je Slug (auch Entwürfe; Abdeckung zählt nur aktive)
	custom: ReadonlyMap<string, CustomInfo>;
	activeCustomSlugs: readonly string[];
};

export const STATIC_CATALOG: OrgCatalog = {
	frameworks: CATALOG_FRAMEWORKS,
	frameworkBySlug: FRAMEWORK_BY_SLUG,
	requirements: ALL_REQUIREMENTS,
	requirementByKey: REQUIREMENT_BY_KEY,
	edges: EDGES,
	edgesByRequirement: EDGES_BY_REQUIREMENT,
	edgesByControl: EDGES_BY_CONTROL,
	reqRefs: CATALOG_REQ_REFS,
	edgeRefs: CATALOG_EDGES,
	custom: new Map(),
	activeCustomSlugs: [],
};

function toCatalogFramework(
	c: CustomCatalogInput,
	i: number,
): CatalogFramework {
	const slug = customSlug(c.framework.key);
	return {
		slug,
		name: c.framework.name,
		...(c.framework.version ? { version: c.framework.version } : {}),
		...(c.framework.issuer ? { authority: c.framework.issuer } : {}),
		jurisdiction: "global",
		description: c.framework.description ?? "",
		...(c.framework.sourceUrl ? { sourceUrl: c.framework.sourceUrl } : {}),
		sortOrder: 10_000 + i,
		phase: "P6",
		...(c.framework.exclusionAllowed
			? {
					exclusion: {
						label:
							c.framework.exclusionLabel ?? "Nicht anwendbar mit Begründung",
						basis: "Eigenes Rahmenwerk der Organisation",
					},
				}
			: {}),
		sections: c.sections.map((s) => ({
			code: s.code,
			title: s.title,
			sortOrder: s.sortOrder,
		})),
		requirements: c.requirements.map((r) => ({
			code: r.code,
			sectionCode: r.sectionCode,
			title: r.title,
			requirementText: r.text,
			domain: r.domain,
			...(r.guidance ? { guidance: r.guidance } : {}),
			...(r.auditQuestions.length ? { auditQuestions: r.auditQuestions } : {}),
			...(r.evidenceHints.length ? { evidenceHints: r.evidenceHints } : {}),
			sortOrder: r.sortOrder,
		})),
	};
}

function groupBy<T>(items: readonly T[], key: (t: T) => string) {
	const map = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = map.get(k);
		if (list) list.push(item);
		else map.set(k, [item]);
	}
	return map;
}

export function buildOrgCatalog(
	custom: readonly CustomCatalogInput[],
): OrgCatalog {
	if (custom.length === 0) return STATIC_CATALOG;
	const own = custom.map((c, i) => toCatalogFramework(c, i));
	const ownReqs = own.flatMap((f) =>
		f.requirements.map((r) => ({ ...r, framework: f.slug })),
	);
	const ownEdges: CatalogControlMapping[] = custom.flatMap((c) => {
		const slug = customSlug(c.framework.key);
		return c.requirements.flatMap((r) =>
			r.controls.map((e) => ({
				control: e.controlCode,
				requirement: `${slug}:${r.code}` as const,
				coverage: e.coverage,
				...(e.note ? { note: e.note } : {}),
			})),
		);
	});
	const frameworks = [...CATALOG_FRAMEWORKS, ...own];
	const requirements = [...ALL_REQUIREMENTS, ...ownReqs];
	const edges = [...EDGES, ...ownEdges];
	const customInfo = new Map<string, CustomInfo>(
		custom.map((c) => [
			customSlug(c.framework.key),
			{
				id: c.framework.id,
				status: c.framework.status,
				copiedFrom: c.framework.copiedFrom,
				origin: c.framework.origin,
				activatedAt: c.framework.activatedAt,
				ownerUserId: c.framework.activatedBy ?? c.framework.createdBy,
				excluded: new Map(
					c.requirements
						.filter((r) => r.excluded)
						.map((r) => [r.code, r.exclusionReason ?? ""]),
				),
				requirementIds: new Map(c.requirements.map((r) => [r.code, r.id])),
			},
		]),
	);
	return {
		frameworks,
		frameworkBySlug: new Map(frameworks.map((f) => [f.slug, f])),
		requirements,
		requirementByKey: new Map(
			requirements.map((r) => [`${r.framework}:${r.code}`, r]),
		),
		edges,
		edgesByRequirement: groupBy(edges, (e) => e.requirement),
		edgesByControl: groupBy(edges, (e) => e.control),
		reqRefs: [
			...CATALOG_REQ_REFS,
			...ownReqs.map((r) => ({
				framework: r.framework,
				code: r.code,
				domain: r.domain,
				sectionCode: r.sectionCode,
				legalStatus: "in_force" as const,
			})),
		],
		edgeRefs: [
			...CATALOG_EDGES,
			...ownEdges.map((e) => ({
				control: e.control,
				requirement: e.requirement,
				coverage: e.coverage,
			})),
		],
		custom: customInfo,
		activeCustomSlugs: custom
			.filter((c) => c.framework.status === "active")
			.map((c) => customSlug(c.framework.key)),
	};
}

// Ausschluss einer eigenen Anforderung (steht in custom_requirements) als
// Anwendbarkeit wie bei Klick-Rahmenwerken (Quelle manual)
export function customApplicability(
	catalog: OrgCatalog,
): Map<string, { applicable: boolean; source: string; note: string | null }> {
	const out = new Map<
		string,
		{ applicable: boolean; source: string; note: string | null }
	>();
	for (const [slug, info] of catalog.custom)
		for (const [code, reason] of info.excluded)
			out.set(`${slug}:${code}`, {
				applicable: false,
				source: "manual",
				note: reason,
			});
	return out;
}

// Darf diese Anforderung ausgeschlossen werden? Klick-Rahmenwerke nach
// exclusionRule, eigene nach ihrer Einstellung.
export function customExclusionAllowed(
	catalog: OrgCatalog,
	slug: string,
): boolean | null {
	if (!catalog.custom.has(slug)) return null;
	return Boolean(catalog.frameworkBySlug.get(slug)?.exclusion);
}
