import { and, eq, inArray } from "drizzle-orm";
import type { GlobalDb } from "@/db";
import {
	controlRequirements,
	controls,
	frameworkSections,
	frameworks,
	requirements,
} from "@/db/schema";
import {
	CATALOG_FRAMEWORKS,
	CONTROLS,
	EDGES,
	splitRequirementKey,
} from "./index";

// Idempotent: upsertet Rahmenwerke, Sections, Anforderungen, Controls und
// Kanten (onConflictDoUpdate), löscht nie. Zweimal ausführen → gleiche Zeilen.

export type CatalogSyncSummary = {
	frameworks: number;
	sections: number;
	requirements: number;
	controls: number;
	edges: number;
	unresolvedEdges: string[];
};

export async function syncCatalog(db: GlobalDb): Promise<CatalogSyncSummary> {
	const summary: CatalogSyncSummary = {
		frameworks: 0,
		sections: 0,
		requirements: 0,
		controls: 0,
		edges: 0,
		unresolvedEdges: [],
	};

	// 1) Rahmenwerke
	const frameworkId = new Map<string, string>();
	for (const f of CATALOG_FRAMEWORKS) {
		const values = {
			slug: f.slug,
			name: f.name,
			version: f.version ?? null,
			authority: f.authority ?? null,
			jurisdiction: f.jurisdiction,
			legalBasis: f.legalBasis ?? null,
			legalBasisRefs: f.legalBasisRefs ?? [],
			description: f.description,
			recommendedApproach: f.recommendedApproach ?? null,
			sourceUrl: f.sourceUrl ?? null,
			sortOrder: f.sortOrder,
		};
		const [row] = await db
			.insert(frameworks)
			.values(values)
			.onConflictDoUpdate({ target: frameworks.slug, set: values })
			.returning({ id: frameworks.id });
		if (row) frameworkId.set(f.slug, row.id);
		summary.frameworks += 1;
	}
	for (const f of CATALOG_FRAMEWORKS) {
		if (!f.successorSlug) continue;
		const succ = frameworkId.get(f.successorSlug);
		if (succ) {
			await db
				.update(frameworks)
				.set({ successorFrameworkId: succ })
				.where(eq(frameworks.slug, f.slug));
		}
	}

	// 2) Sections + Anforderungen
	const requirementId = new Map<string, string>();
	for (const f of CATALOG_FRAMEWORKS) {
		const fid = frameworkId.get(f.slug);
		if (!fid) continue;
		const sectionId = new Map<string, string>();
		for (const s of f.sections) {
			const values = {
				frameworkId: fid,
				code: s.code,
				title: s.title,
				sortOrder: s.sortOrder,
			};
			const [row] = await db
				.insert(frameworkSections)
				.values(values)
				.onConflictDoUpdate({
					target: [frameworkSections.frameworkId, frameworkSections.code],
					set: { title: s.title, sortOrder: s.sortOrder },
				})
				.returning({ id: frameworkSections.id });
			if (row) sectionId.set(s.code, row.id);
			summary.sections += 1;
		}
		for (const r of f.requirements) {
			const values = {
				frameworkId: fid,
				sectionId: sectionId.get(r.sectionCode) ?? null,
				code: r.code,
				title: r.title,
				requirementText: r.requirementText,
				guidance: r.guidance ?? null,
				legalBasisRefs: r.legalBasisRefs ?? [],
				domain: r.domain,
				services: r.services ?? null,
				appliesFromStage: r.appliesFromStage ?? null,
				appliesToRoles: r.appliesToRoles ?? null,
				effectiveFrom: r.effectiveFrom ?? null,
				effectiveUntil: r.effectiveUntil ?? null,
				legalStatus: r.legalStatus ?? ("in_force" as const),
				evidenceHints: r.evidenceHints ?? [],
				sourceUrl: r.sourceUrl ?? null,
				relatedRequirements: r.relatedRequirements ?? [],
				recommendations: r.recommendations ?? null,
				auditQuestions: r.auditQuestions ?? [],
				pitfalls: r.pitfalls ?? [],
				tools: r.tools ?? null,
				sortOrder: r.sortOrder,
			};
			const { frameworkId: _f, code: _c, ...set } = values;
			const [row] = await db
				.insert(requirements)
				.values(values)
				.onConflictDoUpdate({
					target: [requirements.frameworkId, requirements.code],
					set,
				})
				.returning({ id: requirements.id });
			if (row) requirementId.set(`${f.slug}:${r.code}`, row.id);
			summary.requirements += 1;
		}
	}

	// 3) Controls
	const controlId = new Map<string, string>();
	for (const c of CONTROLS) {
		const values = {
			code: c.code,
			title: c.title,
			description: c.description,
			implementationGuidance: c.implementationGuidance ?? null,
			domain: c.domain,
			effort: c.effort,
			kind: c.kind,
			evidenceHints: c.evidenceHints ?? [],
			recommendations: c.recommendations ?? null,
			auditQuestions: c.auditQuestions ?? [],
			testMethodHint: c.testMethodHint ?? null,
			templates: c.templates ?? [],
			processes: c.processes ?? [],
			obligations: c.obligations ?? [],
			tools: c.tools ?? null,
			sortOrder: c.sortOrder,
		};
		const { code: _code, ...set } = values;
		const [row] = await db
			.insert(controls)
			.values(values)
			.onConflictDoUpdate({ target: controls.code, set })
			.returning({ id: controls.id });
		if (row) controlId.set(c.code, row.id);
		summary.controls += 1;
	}

	// 4) Kanten
	for (const e of EDGES) {
		const cid = controlId.get(e.control);
		const rid = requirementId.get(e.requirement);
		if (!cid || !rid) {
			summary.unresolvedEdges.push(`${e.control} → ${e.requirement}`);
			continue;
		}
		await db
			.insert(controlRequirements)
			.values({
				controlId: cid,
				requirementId: rid,
				coverage: e.coverage,
				note: e.note ?? null,
			})
			.onConflictDoUpdate({
				target: [
					controlRequirements.controlId,
					controlRequirements.requirementId,
				],
				set: { coverage: e.coverage, note: e.note ?? null },
			});
		summary.edges += 1;
	}

	return summary;
}

// Hilfsabfrage für Tests/Skripte: Kanten eines Rahmenwerks in der DB.
export async function countEdgesForFramework(
	db: GlobalDb,
	slug: string,
): Promise<number> {
	const [fw] = await db
		.select({ id: frameworks.id })
		.from(frameworks)
		.where(eq(frameworks.slug, slug))
		.limit(1);
	if (!fw) return 0;
	const reqs = await db
		.select({ id: requirements.id })
		.from(requirements)
		.where(and(eq(requirements.frameworkId, fw.id)));
	if (reqs.length === 0) return 0;
	const rows = await db
		.select({ id: controlRequirements.id })
		.from(controlRequirements)
		.where(
			inArray(
				controlRequirements.requirementId,
				reqs.map((r) => r.id),
			),
		);
	return rows.length;
}

export { splitRequirementKey };
