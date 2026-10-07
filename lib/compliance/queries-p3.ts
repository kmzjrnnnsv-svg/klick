import { and, asc, eq, inArray } from "drizzle-orm";
import {
	approvalRequests,
	assets,
	auditFindings,
	auditProgrammeItems,
	auditProgrammes,
	auditRequests,
	audits,
	communications,
	complaints,
	conflictsOfInterest,
	contextIssues,
	controlImplementations,
	controls,
	controlTests,
	documentProcesses,
	documents,
	frameworks,
	interestedParties,
	kpiMeasurements,
	managementReviews,
	nonconformities,
	objectives,
	obligationRuns,
	obligations,
	processAssets,
	processControls,
	processes,
	processProviders,
	processRaci,
	processRisks,
	providers,
	regulatorInteractions,
	requirements,
	resolutions,
	risks,
	roleAssignments,
	scopes,
	whistleblowingReports,
} from "@/db/schema";
import type { LicenceStage } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import { requiredFunctions, roleCoverage } from "./catalog/required-functions";
import { checkSod } from "./catalog/sod-rules";
import { listControlRows, listTasks, userNames } from "./queries";
import { listDocuments, listRisks } from "./queries-p2";

// Org-gescopte Lesezugriffe für die Managementsystem-Schicht (P3) — immer in
// readOrg/withOrg.

export type ProcessRow = typeof processes.$inferSelect & {
	names: Record<string, string | null>;
	accountable: string | null; // Name oder Funktion des A
	raciCount: number;
	controlCount: number;
	assetCount: number;
	providerCount: number;
};

export async function listProcesses(
	tx: OrgTx,
	orgId: string,
): Promise<ProcessRow[]> {
	const rows = await tx
		.select()
		.from(processes)
		.where(eq(processes.organizationId, orgId))
		.orderBy(asc(processes.code));
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const [raci, pc, pa, pp] = await Promise.all([
		tx.select().from(processRaci).where(inArray(processRaci.processId, ids)),
		tx
			.select({ processId: processControls.processId })
			.from(processControls)
			.where(inArray(processControls.processId, ids)),
		tx
			.select({ processId: processAssets.processId })
			.from(processAssets)
			.where(inArray(processAssets.processId, ids)),
		tx
			.select({ processId: processProviders.processId })
			.from(processProviders)
			.where(inArray(processProviders.processId, ids)),
	]);
	const names = await userNames(tx, [
		...rows.flatMap((r) => [r.ownerUserId, r.deputyUserId, r.assigneeUserId]),
		...raci.map((r) => r.userId),
	]);
	const count = (list: { processId: string }[], id: string) =>
		list.filter((x) => x.processId === id).length;
	return rows.map((r) => {
		const a = raci.find((x) => x.processId === r.id && x.raci === "A");
		return {
			...r,
			names: {
				ownerUserId: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				deputyUserId: r.deputyUserId
					? (names.get(r.deputyUserId) ?? null)
					: null,
				assigneeUserId: r.assigneeUserId
					? (names.get(r.assigneeUserId) ?? null)
					: null,
			},
			accountable: a
				? a.userId
					? (names.get(a.userId) ?? null)
					: (a.function ?? null)
				: null,
			raciCount: count(raci, r.id),
			controlCount: count(pc, r.id),
			assetCount: count(pa, r.id),
			providerCount: count(pp, r.id),
		};
	});
}

export async function getProcessByCode(tx: OrgTx, orgId: string, code: string) {
	const [p] = await tx
		.select()
		.from(processes)
		.where(and(eq(processes.organizationId, orgId), eq(processes.code, code)))
		.limit(1);
	if (!p) return null;
	const [raci, ctrl, ast, prov, rsk, docs] = await Promise.all([
		tx
			.select()
			.from(processRaci)
			.where(eq(processRaci.processId, p.id))
			.orderBy(asc(processRaci.raci)),
		tx
			.select({
				code: controls.code,
				title: controls.title,
				status: controlImplementations.status,
			})
			.from(processControls)
			.innerJoin(controls, eq(controls.id, processControls.controlId))
			.leftJoin(
				controlImplementations,
				and(
					eq(controlImplementations.controlId, controls.id),
					eq(controlImplementations.organizationId, orgId),
				),
			)
			.where(eq(processControls.processId, p.id))
			.orderBy(asc(controls.code)),
		tx
			.select({
				id: assets.id,
				name: assets.name,
				type: assets.type,
				providerId: assets.providerId,
			})
			.from(processAssets)
			.innerJoin(assets, eq(assets.id, processAssets.assetId))
			.where(eq(processAssets.processId, p.id)),
		tx
			.select({
				id: providers.id,
				name: providers.name,
				criticality: providers.criticality,
				country: providers.country,
			})
			.from(processProviders)
			.innerJoin(providers, eq(providers.id, processProviders.providerId))
			.where(eq(processProviders.processId, p.id)),
		tx
			.select({ id: risks.id, code: risks.code, title: risks.title })
			.from(processRisks)
			.innerJoin(risks, eq(risks.id, processRisks.riskId))
			.where(eq(processRisks.processId, p.id)),
		tx
			.select({
				id: documents.id,
				docNumber: documents.docNumber,
				title: documents.title,
				status: documents.status,
			})
			.from(documentProcesses)
			.innerJoin(documents, eq(documents.id, documentProcesses.documentId))
			.where(eq(documentProcesses.processId, p.id)),
	]);
	const names = await userNames(tx, [
		p.ownerUserId,
		p.deputyUserId,
		p.assigneeUserId,
		...raci.map((r) => r.userId),
	]);
	return {
		process: p,
		raci,
		controls: ctrl,
		assets: ast,
		providers: prov,
		risks: rsk,
		documents: docs,
		names,
	};
}

export type DependencyNode = {
	id: string;
	code: string;
	name: string;
	criticality: string;
	rtoHours: number | null;
	rpoHours: number | null;
	assets: {
		id: string;
		name: string;
		type: string;
		providerName: string | null;
	}[];
	providers: { id: string; name: string; criticality: string }[];
};

// Abhängigkeitskarte Prozess → System → Dienstleister (DORA Art. 8, Businessplan 17.12 AP3).
export async function dependencyMap(
	tx: OrgTx,
	orgId: string,
): Promise<DependencyNode[]> {
	const procs = await tx
		.select()
		.from(processes)
		.where(
			and(eq(processes.organizationId, orgId), eq(processes.status, "active")),
		)
		.orderBy(asc(processes.code));
	if (procs.length === 0) return [];
	const ids = procs.map((p) => p.id);
	const [pa, pp, allProviders] = await Promise.all([
		tx
			.select({
				processId: processAssets.processId,
				id: assets.id,
				name: assets.name,
				type: assets.type,
				providerId: assets.providerId,
			})
			.from(processAssets)
			.innerJoin(assets, eq(assets.id, processAssets.assetId))
			.where(inArray(processAssets.processId, ids)),
		tx
			.select({
				processId: processProviders.processId,
				id: providers.id,
				name: providers.name,
				criticality: providers.criticality,
			})
			.from(processProviders)
			.innerJoin(providers, eq(providers.id, processProviders.providerId))
			.where(inArray(processProviders.processId, ids)),
		tx
			.select({
				id: providers.id,
				name: providers.name,
				criticality: providers.criticality,
			})
			.from(providers)
			.where(eq(providers.organizationId, orgId)),
	]);
	const providerName = new Map(allProviders.map((p) => [p.id, p.name]));
	return procs.map((p) => {
		const direct = pp.filter((x) => x.processId === p.id);
		const viaAssets = pa
			.filter((x) => x.processId === p.id && x.providerId)
			.map((x) => allProviders.find((pr) => pr.id === x.providerId))
			.filter((x): x is (typeof allProviders)[number] => Boolean(x));
		const merged = new Map<
			string,
			{ id: string; name: string; criticality: string }
		>();
		for (const x of [...direct, ...viaAssets])
			merged.set(x.id, { id: x.id, name: x.name, criticality: x.criticality });
		return {
			id: p.id,
			code: p.code,
			name: p.name,
			criticality: p.criticality,
			rtoHours: p.rtoHours,
			rpoHours: p.rpoHours,
			assets: pa
				.filter((x) => x.processId === p.id)
				.map((x) => ({
					id: x.id,
					name: x.name,
					type: x.type,
					providerName: x.providerId
						? (providerName.get(x.providerId) ?? null)
						: null,
				})),
			providers: [...merged.values()],
		};
	});
}

// Konzentration: wie viele kritische Prozesse hängen an einem Dienstleister?
export function providerConcentration(nodes: readonly DependencyNode[]) {
	const out = new Map<
		string,
		{ name: string; critical: number; total: number }
	>();
	for (const n of nodes) {
		for (const p of n.providers) {
			const e = out.get(p.id) ?? { name: p.name, critical: 0, total: 0 };
			e.total += 1;
			if (n.criticality === "critical") e.critical += 1;
			out.set(p.id, e);
		}
	}
	return [...out.entries()]
		.map(([id, v]) => ({ id, ...v }))
		.sort((a, b) => b.critical - a.critical || b.total - a.total);
}

// ── Organisation ───────────────────────────────────────────────────────────

export async function listContextIssues(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(contextIssues)
		.where(eq(contextIssues.organizationId, orgId))
		.orderBy(asc(contextIssues.scope), asc(contextIssues.title));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listInterestedParties(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(interestedParties)
		.where(eq(interestedParties.organizationId, orgId))
		.orderBy(asc(interestedParties.type), asc(interestedParties.name));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listScopes(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			scope: scopes,
			frameworkSlug: frameworks.slug,
			frameworkName: frameworks.name,
		})
		.from(scopes)
		.leftJoin(frameworks, eq(frameworks.id, scopes.frameworkId))
		.where(eq(scopes.organizationId, orgId))
		.orderBy(asc(scopes.createdAt));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.scope.ownerUserId, r.scope.approvedByUserId]),
	);
	return rows.map((r) => ({
		...r.scope,
		frameworkSlug: r.frameworkSlug,
		frameworkName: r.frameworkName,
		ownerName: r.scope.ownerUserId
			? (names.get(r.scope.ownerUserId) ?? null)
			: null,
		approvedByName: r.scope.approvedByUserId
			? (names.get(r.scope.approvedByUserId) ?? null)
			: null,
	}));
}

export async function listRoleAssignments(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId))
		.orderBy(asc(roleAssignments.function));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.userId, r.deputyUserId]),
	);
	return rows.map((r) => ({
		...r,
		holderName: r.userId ? (names.get(r.userId) ?? null) : r.externalName,
		deputyName: r.deputyUserId ? (names.get(r.deputyUserId) ?? null) : null,
	}));
}

// Pflichtfunktionen × Besetzung × Funktionstrennung für /organisation,
// Setup-Checkliste und /ueberblick.
export async function governanceStatus(
	tx: OrgTx,
	orgId: string,
	frameworkSlugs: readonly string[],
	stage: LicenceStage,
) {
	const assignments = await listRoleAssignments(tx, orgId);
	const required = requiredFunctions(frameworkSlugs, stage);
	const coverage = roleCoverage(required, assignments);
	const sod = checkSod(assignments).map((v) => ({
		...v,
		userName:
			assignments.find((a) => a.userId === v.userId)?.holderName ?? v.userId,
	}));
	return { assignments, required, coverage, sod };
}

export async function listObjectives(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(objectives)
		.where(eq(objectives.organizationId, orgId))
		.orderBy(asc(objectives.dueAt), asc(objectives.title));
	if (rows.length === 0) return [];
	const measurements = await tx
		.select()
		.from(kpiMeasurements)
		.where(
			inArray(
				kpiMeasurements.objectiveId,
				rows.map((r) => r.id),
			),
		)
		.orderBy(asc(kpiMeasurements.measuredAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => {
		const ms = measurements.filter((m) => m.objectiveId === r.id);
		return {
			...r,
			ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
			measurements: ms,
			latest: ms[ms.length - 1] ?? null,
		};
	});
}

export async function listCommunications(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ c: communications, partyName: interestedParties.name })
		.from(communications)
		.leftJoin(
			interestedParties,
			eq(interestedParties.id, communications.interestedPartyId),
		)
		.where(eq(communications.organizationId, orgId))
		.orderBy(asc(communications.trigger), asc(communications.topic));
	const names = await userNames(
		tx,
		rows.map((r) => r.c.ownerUserId),
	);
	return rows.map((r) => ({
		...r.c,
		partyName: r.partyName,
		ownerName: r.c.ownerUserId ? (names.get(r.c.ownerUserId) ?? null) : null,
	}));
}

export async function listRegulatorInteractions(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(regulatorInteractions)
		.where(eq(regulatorInteractions.organizationId, orgId))
		.orderBy(
			asc(regulatorInteractions.status),
			asc(regulatorInteractions.deadline),
		);
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listConflicts(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(conflictsOfInterest)
		.where(eq(conflictsOfInterest.organizationId, orgId))
		.orderBy(asc(conflictsOfInterest.status), asc(conflictsOfInterest.title));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

// ── Beschlüsse ─────────────────────────────────────────────────────────────

export async function listResolutions(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ r: resolutions, approvalStatus: approvalRequests.status })
		.from(resolutions)
		.leftJoin(
			approvalRequests,
			eq(approvalRequests.id, resolutions.approvalRequestId),
		)
		.where(eq(resolutions.organizationId, orgId))
		.orderBy(asc(resolutions.date), asc(resolutions.resolutionNumber));
	const names = await userNames(
		tx,
		rows.flatMap((x) => [x.r.createdByUserId, ...x.r.attendeeUserIds]),
	);
	return rows.map((x) => ({
		...x.r,
		approvalStatus: x.approvalStatus,
		// gilt als gefasst, wenn keine Freigabe nötig war oder sie erteilt wurde
		effective: !x.r.approvalRequestId || x.approvalStatus === "approved",
		createdByName: x.r.createdByUserId
			? (names.get(x.r.createdByUserId) ?? null)
			: null,
		attendeeNames: x.r.attendeeUserIds.map((id) => names.get(id) ?? id),
	}));
}

// ── Audits ─────────────────────────────────────────────────────────────────

export async function listAuditProgrammes(tx: OrgTx, orgId: string) {
	const progs = await tx
		.select()
		.from(auditProgrammes)
		.where(eq(auditProgrammes.organizationId, orgId))
		.orderBy(asc(auditProgrammes.cycleStart));
	if (progs.length === 0) return [];
	const items = await tx
		.select()
		.from(auditProgrammeItems)
		.where(
			inArray(
				auditProgrammeItems.programmeId,
				progs.map((p) => p.id),
			),
		)
		.orderBy(asc(auditProgrammeItems.plannedYear));
	return progs.map((p) => ({
		...p,
		items: items.filter((i) => i.programmeId === p.id),
	}));
}

export async function listAudits(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(audits)
		.where(eq(audits.organizationId, orgId))
		.orderBy(asc(audits.plannedAt));
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const [findings, requests] = await Promise.all([
		tx
			.select({ auditId: auditFindings.auditId, status: auditFindings.status })
			.from(auditFindings)
			.where(inArray(auditFindings.auditId, ids)),
		tx
			.select({ auditId: auditRequests.auditId, status: auditRequests.status })
			.from(auditRequests)
			.where(inArray(auditRequests.auditId, ids)),
	]);
	const names = await userNames(
		tx,
		rows.flatMap((r) => [
			r.ownerUserId,
			r.auditorUserId,
			...r.auditorMemberIds,
		]),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		auditorNames: [
			...r.auditorMemberIds.map((id) => names.get(id) ?? id),
			...(r.externalAuditor ? [r.externalAuditor] : []),
		],
		findingsOpen: findings.filter(
			(f) => f.auditId === r.id && f.status !== "closed",
		).length,
		findingsTotal: findings.filter((f) => f.auditId === r.id).length,
		requestsOpen: requests.filter(
			(q) =>
				q.auditId === r.id && (q.status === "open" || q.status === "answered"),
		).length,
		requestsTotal: requests.filter((q) => q.auditId === r.id).length,
	}));
}

export async function getAudit(tx: OrgTx, orgId: string, auditId: string) {
	const [a] = await tx
		.select()
		.from(audits)
		.where(and(eq(audits.id, auditId), eq(audits.organizationId, orgId)))
		.limit(1);
	if (!a) return null;
	const [findings, requests] = await Promise.all([
		tx
			.select({
				f: auditFindings,
				controlCode: controls.code,
				requirementCode: requirements.code,
				ncCode: nonconformities.code,
				ncStatus: nonconformities.status,
			})
			.from(auditFindings)
			.leftJoin(controls, eq(controls.id, auditFindings.controlId))
			.leftJoin(requirements, eq(requirements.id, auditFindings.requirementId))
			.leftJoin(
				nonconformities,
				eq(nonconformities.id, auditFindings.nonconformityId),
			)
			.where(eq(auditFindings.auditId, auditId))
			.orderBy(asc(auditFindings.createdAt)),
		tx
			.select({
				q: auditRequests,
				controlCode: controls.code,
				requirementCode: requirements.code,
			})
			.from(auditRequests)
			.leftJoin(controls, eq(controls.id, auditRequests.controlId))
			.leftJoin(requirements, eq(requirements.id, auditRequests.requirementId))
			.where(eq(auditRequests.auditId, auditId))
			.orderBy(asc(auditRequests.createdAt)),
	]);
	const names = await userNames(tx, [
		a.ownerUserId,
		a.auditorUserId,
		...a.auditorMemberIds,
		...findings.map((f) => f.f.createdByUserId),
		...requests.flatMap((r) => [r.q.requestedByUserId, r.q.assigneeUserId]),
	]);
	return {
		audit: a,
		findings: findings.map((x) => ({
			...x.f,
			controlCode: x.controlCode,
			requirementCode: x.requirementCode,
			ncCode: x.ncCode,
			ncStatus: x.ncStatus,
		})),
		requests: requests.map((x) => ({
			...x.q,
			controlCode: x.controlCode,
			requirementCode: x.requirementCode,
		})),
		names,
	};
}

export async function listAllFindings(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			f: auditFindings,
			auditTitle: audits.title,
			controlCode: controls.code,
			ncCode: nonconformities.code,
		})
		.from(auditFindings)
		.innerJoin(audits, eq(audits.id, auditFindings.auditId))
		.leftJoin(controls, eq(controls.id, auditFindings.controlId))
		.leftJoin(
			nonconformities,
			eq(nonconformities.id, auditFindings.nonconformityId),
		)
		.where(eq(auditFindings.organizationId, orgId))
		.orderBy(asc(auditFindings.status), asc(auditFindings.createdAt));
	return rows.map((x) => ({
		...x.f,
		auditTitle: x.auditTitle,
		controlCode: x.controlCode,
		ncCode: x.ncCode,
	}));
}

// ── Abweichungen ───────────────────────────────────────────────────────────

export async function listNonconformities(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(nonconformities)
		.where(eq(nonconformities.organizationId, orgId))
		.orderBy(asc(nonconformities.status), asc(nonconformities.dueAt));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.ownerUserId, r.assigneeUserId]),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		assigneeName: r.assigneeUserId
			? (names.get(r.assigneeUserId) ?? null)
			: null,
	}));
}

export async function getNonconformity(tx: OrgTx, orgId: string, id: string) {
	const [r] = await tx
		.select()
		.from(nonconformities)
		.where(
			and(
				eq(nonconformities.id, id),
				eq(nonconformities.organizationId, orgId),
			),
		)
		.limit(1);
	if (!r) return null;
	const names = await userNames(tx, [r.ownerUserId, r.assigneeUserId]);
	return { nc: r, names };
}

// ── Managementbewertung ────────────────────────────────────────────────────

export async function listManagementReviews(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(managementReviews)
		.where(eq(managementReviews.organizationId, orgId))
		.orderBy(asc(managementReviews.heldAt));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.ownerUserId, ...r.attendeeUserIds]),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		attendeeNames: r.attendeeUserIds.map((id) => names.get(id) ?? id),
	}));
}

// ── Pflichten-Kalender ─────────────────────────────────────────────────────

export async function listObligations(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ o: obligations, frameworkSlug: frameworks.slug })
		.from(obligations)
		.leftJoin(frameworks, eq(frameworks.id, obligations.frameworkId))
		.where(eq(obligations.organizationId, orgId))
		.orderBy(asc(obligations.code));
	const names = await userNames(
		tx,
		rows.map((r) => r.o.ownerUserId),
	);
	return rows.map((r) => ({
		...r.o,
		frameworkSlug: r.frameworkSlug,
		ownerName: r.o.ownerUserId ? (names.get(r.o.ownerUserId) ?? null) : null,
	}));
}

export async function listObligationRuns(
	tx: OrgTx,
	orgId: string,
	opts: { from?: string; to?: string } = {},
) {
	const rows = await tx
		.select({
			run: obligationRuns,
			code: obligations.code,
			title: obligations.title,
			legalBasis: obligations.legalBasis,
			recipient: obligations.recipient,
			leadDays: obligations.leadDays,
			ownerUserId: obligations.ownerUserId,
			frequency: obligations.frequency,
		})
		.from(obligationRuns)
		.innerJoin(obligations, eq(obligations.id, obligationRuns.obligationId))
		.where(eq(obligationRuns.organizationId, orgId))
		.orderBy(asc(obligationRuns.dueAt));
	const names = await userNames(
		tx,
		rows.flatMap((r) => [r.ownerUserId, r.run.completedByUserId]),
	);
	return rows
		.filter(
			(r) =>
				(!opts.from || r.run.dueAt >= opts.from) &&
				(!opts.to || r.run.dueAt <= opts.to),
		)
		.map((r) => ({
			...r.run,
			code: r.code,
			title: r.title,
			legalBasis: r.legalBasis,
			recipient: r.recipient,
			leadDays: r.leadDays,
			frequency: r.frequency,
			ownerUserId: r.ownerUserId,
			ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
			completedByName: r.run.completedByUserId
				? (names.get(r.run.completedByUserId) ?? null)
				: null,
		}));
}

// ── Testprogramm ───────────────────────────────────────────────────────────

export async function listAllControlTests(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			test: controlTests,
			controlCode: controls.code,
			controlTitle: controls.title,
			implementationId: controlImplementations.id,
			processCode: processes.code,
			processName: processes.name,
		})
		.from(controlTests)
		.leftJoin(
			controlImplementations,
			eq(controlImplementations.id, controlTests.implementationId),
		)
		.leftJoin(controls, eq(controls.id, controlImplementations.controlId))
		.leftJoin(processes, eq(processes.id, controlTests.processId))
		.where(eq(controlTests.organizationId, orgId))
		.orderBy(asc(controlTests.plannedAt), asc(controlTests.testedAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.test.testerUserId),
	);
	return rows.map((r) => ({
		...r.test,
		controlCode: r.controlCode,
		controlTitle: r.controlTitle,
		processCode: r.processCode,
		processName: r.processName,
		testerName: r.test.testerUserId
			? (names.get(r.test.testerUserId) ?? null)
			: null,
	}));
}

// ── Beschwerden & Hinweise ─────────────────────────────────────────────────

export async function listComplaints(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(complaints)
		.where(eq(complaints.organizationId, orgId))
		.orderBy(asc(complaints.status), asc(complaints.receivedAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listWhistleblowingReports(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(whistleblowingReports)
		.where(eq(whistleblowingReports.organizationId, orgId))
		.orderBy(
			asc(whistleblowingReports.status),
			asc(whistleblowingReports.receivedAt),
		);
}

// ── Rechenschaftssicht ─────────────────────────────────────────────────────

export async function accountabilityFor(
	tx: OrgTx,
	orgId: string,
	userId: string,
	today = new Date().toISOString().slice(0, 10),
) {
	const [controls, procs, docs, riskRows, taskRows, ncs, obls, auditRows] =
		await Promise.all([
			listControlRows(tx, orgId),
			listProcesses(tx, orgId),
			listDocuments(tx, orgId),
			listRisks(tx, orgId),
			listTasks(tx, orgId, { assigneeUserId: userId, openOnly: true }),
			listNonconformities(tx, orgId),
			listObligations(tx, orgId),
			listAudits(tx, orgId),
		]);
	const raciA = await tx
		.select({ processId: processRaci.processId })
		.from(processRaci)
		.where(
			and(
				eq(processRaci.organizationId, orgId),
				eq(processRaci.userId, userId),
				eq(processRaci.raci, "A"),
			),
		);
	const aSet = new Set(raciA.map((r) => r.processId));
	return {
		controls: controls.filter(
			(c) => c.ownerUserId === userId || c.assigneeUserId === userId,
		),
		overdueReviews: controls.filter(
			(c) =>
				c.ownerUserId === userId &&
				c.nextReviewAt !== null &&
				c.nextReviewAt < today &&
				c.status !== "not_applicable",
		),
		processes: procs.filter(
			(p) =>
				p.status !== "retired" &&
				(p.ownerUserId === userId ||
					p.deputyUserId === userId ||
					aSet.has(p.id)),
		),
		documents: docs.filter(
			(d) =>
				d.ownerUserId === userId &&
				d.status !== "retired" &&
				d.status !== "superseded",
		),
		risks: riskRows.filter(
			(r) => r.ownerUserId === userId && r.status !== "closed",
		),
		tasks: taskRows,
		nonconformities: ncs.filter(
			(n) =>
				(n.ownerUserId === userId || n.assigneeUserId === userId) &&
				n.status !== "closed",
		),
		obligations: obls.filter((o) => o.ownerUserId === userId && o.active),
		audits: auditRows.filter(
			(a) =>
				(a.ownerUserId === userId || a.auditorMemberIds.includes(userId)) &&
				a.status !== "closed",
		),
	};
}
