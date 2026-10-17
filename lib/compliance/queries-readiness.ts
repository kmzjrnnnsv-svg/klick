import { and, eq, inArray } from "drizzle-orm";
import { auditRequests, audits, frameworks, requirements } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { ALL_REQUIREMENTS, CONTROL_BY_CODE } from "./catalog";
import { mandatoryTemplatesFor } from "./catalog/document-templates";
import { CATALOG_EDGES } from "./catalog-view";
import {
	listEvidenceWithControls,
	type OrgCoverage,
	orgCoverage,
} from "./queries";
import { listDocuments } from "./queries-p2";
import {
	listAllControlTests,
	listAllFindings,
	listNonconformities,
} from "./queries-p3";
import {
	combineReadiness,
	deriveReadiness,
	type ReadinessBlocker,
	type ReadinessControl,
	type ReadinessInput,
	type ReadinessResult,
} from "./readiness";

// Daten für die Prüfungsreife (lib/compliance/readiness.ts) aus der Org laden
// — innerhalb von readOrg. Ein Aufruf liest jede Quelle genau einmal und
// rechnet dann je Rahmenwerk.

const NO_TEST_NEEDED = new Set(["inspection", "interview"]);

export type ReadinessContext = {
	cov: OrgCoverage;
	results: ReadinessResult[];
	combined: ReturnType<typeof combineReadiness>;
};

export async function loadReadiness(
	tx: OrgTx,
	orgId: string,
	opts: {
		asOf: Date;
		frameworks?: readonly string[];
		auditId?: string;
		// zusätzliche Blocker je Rahmenwerk (CRA-Produkte, …)
		extraBlockers?: ReadonlyMap<string, readonly ReadinessBlocker[]>;
		securityFindings?: ReadinessInput["securityFindings"];
	},
): Promise<ReadinessContext | null> {
	const cov = await orgCoverage(tx, orgId, { asOf: opts.asOf });
	if (!cov) return null;
	const slugs = (opts.frameworks ?? cov.frameworks).filter((s) =>
		cov.frameworks.includes(s),
	);

	const [evidenceRows, tests, docs, ncs, findings] = await Promise.all([
		listEvidenceWithControls(tx, orgId),
		listAllControlTests(tx, orgId),
		listDocuments(tx, orgId),
		listNonconformities(tx, orgId),
		listAllFindings(tx, orgId),
	]);

	// Nachweise und Tests je Control-Code
	const evidenceByControl = new Map<
		string,
		{ validUntil: string | null; createdAt: Date }[]
	>();
	for (const e of evidenceRows)
		for (const code of e.controlCodes) {
			const list = evidenceByControl.get(code) ?? [];
			list.push({ validUntil: e.validUntil, createdAt: e.createdAt });
			evidenceByControl.set(code, list);
		}
	const testsByControl = new Map<string, ReadinessControl["tests"][number][]>();
	const testControl = new Map<string, string>();
	for (const t of tests) {
		if (!t.controlCode) continue;
		testControl.set(t.id, t.controlCode);
		const list = testsByControl.get(t.controlCode) ?? [];
		list.push({
			testedAt: t.testedAt,
			result: t.result,
			nextTestAt: t.nextTestAt,
		});
		testsByControl.set(t.controlCode, list);
	}

	// Abweichungen → betroffene Controls (Test-Quelle oder Finding)
	const ncControls = new Map<string, Set<string>>();
	const addNc = (ncId: string | null, code: string | null | undefined) => {
		if (!ncId || !code) return;
		const set = ncControls.get(ncId) ?? new Set<string>();
		set.add(code);
		ncControls.set(ncId, set);
	};
	for (const f of findings) addNc(f.nonconformityId, f.controlCode);
	for (const nc of ncs)
		if (nc.source === "control_test" && nc.sourceRefId)
			addNc(nc.id, testControl.get(nc.sourceRefId));

	// Findings → Anforderungs-Key (framework:code)
	const reqIds = [
		...new Set(findings.map((f) => f.requirementId).filter(Boolean)),
	] as string[];
	const reqKeyById = new Map<string, string>();
	if (reqIds.length > 0) {
		const rows = await tx
			.select({
				id: requirements.id,
				code: requirements.code,
				slug: frameworks.slug,
			})
			.from(requirements)
			.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.where(inArray(requirements.id, reqIds));
		for (const r of rows) reqKeyById.set(r.id, `${r.slug}:${r.code}`);
	}

	// PBC des Audits
	let pbc: ReadinessInput["pbc"];
	if (opts.auditId) {
		const [a] = await tx
			.select({ id: audits.id })
			.from(audits)
			.where(and(eq(audits.id, opts.auditId), eq(audits.organizationId, orgId)))
			.limit(1);
		if (a) {
			const reqs = await tx
				.select()
				.from(auditRequests)
				.where(
					and(
						eq(auditRequests.organizationId, orgId),
						eq(auditRequests.auditId, a.id),
					),
				);
			pbc = {
				total: reqs.length,
				answered: reqs.filter((r) => r.status === "answered").length,
				accepted: reqs.filter((r) => r.status === "accepted").length,
				open: reqs
					.filter((r) => r.status === "open")
					.map((r) => ({ id: r.id, title: r.title, dueAt: r.dueAt })),
				rejected: reqs
					.filter((r) => r.status === "rejected")
					.map((r) => ({ id: r.id, title: r.title })),
			};
		}
	}

	// Pflichtdokumente: bestes Dokument je Vorlage (freigegeben vor Entwurf)
	const docRank = (s: string) =>
		s === "published" ? 0 : s === "approved" ? 1 : s === "in_review" ? 2 : 3;
	const docByTemplate = new Map<string, (typeof docs)[number]>();
	for (const d of docs) {
		if (!d.templateCode || d.status === "retired" || d.status === "superseded")
			continue;
		const prev = docByTemplate.get(d.templateCode);
		if (!prev || docRank(d.status) < docRank(prev.status))
			docByTemplate.set(d.templateCode, d);
	}

	const results: ReadinessResult[] = [];
	for (const slug of slugs) {
		const reqs = ALL_REQUIREMENTS.filter((r) => r.framework === slug).map(
			(r) => {
				const key = `${slug}:${r.code}`;
				return {
					key,
					sectionCode: r.sectionCode,
					status: cov.result.byRequirement.get(key) ?? "open",
				};
			},
		);
		const keys = new Set(reqs.map((r) => r.key));
		const edges = CATALOG_EDGES.filter((e) => keys.has(e.requirement));
		const controls = new Map<string, ReadinessControl>();
		for (const e of edges) {
			if (controls.has(e.control)) continue;
			const meta = CONTROL_BY_CODE.get(e.control);
			controls.set(e.control, {
				title: meta?.title ?? e.control,
				effort: meta?.effort ?? "M",
				implStatus: cov.implStatus.get(e.control) ?? "not_started",
				testRequired: Boolean(
					meta?.testMethodHint && !NO_TEST_NEEDED.has(meta.testMethodHint),
				),
				evidence: evidenceByControl.get(e.control) ?? [],
				tests: testsByControl.get(e.control) ?? [],
			});
		}
		results.push(
			deriveReadiness({
				framework: slug,
				asOf: opts.asOf,
				requirements: reqs,
				edges,
				controls,
				mandatoryDocs: mandatoryTemplatesFor(slug).map((tpl) => {
					const d = docByTemplate.get(tpl.code);
					return {
						templateCode: tpl.code,
						title: tpl.title,
						doc: d
							? {
									docNumber: d.docNumber,
									status: d.status,
									nextReviewAt: d.nextReviewAt,
								}
							: null,
					};
				}),
				nonconformities: ncs.map((nc) => ({
					id: nc.id,
					code: nc.code,
					title: nc.title,
					status: nc.status,
					priority: nc.priority,
					dueAt: nc.dueAt,
					controlCodes: [...(ncControls.get(nc.id) ?? [])],
				})),
				findings: findings.map((f) => ({
					id: f.id,
					auditId: f.auditId,
					title: f.title,
					severity: f.severity,
					status: f.status,
					controlCode: f.controlCode,
					requirementKey: f.requirementId
						? (reqKeyById.get(f.requirementId) ?? null)
						: null,
				})),
				securityFindings: opts.securityFindings,
				pbc,
				extraBlockers: opts.extraBlockers?.get(slug),
			}),
		);
	}
	return { cov, results, combined: combineReadiness(results) };
}
