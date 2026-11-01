import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNotNull,
} from "drizzle-orm";
import {
	assets,
	auditLog,
	comments,
	controls,
	controlTests,
	documentAcknowledgements,
	documentControls,
	documents,
	documentVersions,
	exceptions,
	incidents,
	incidentUpdates,
	lossEvents,
	providers,
	riskAssets,
	riskControls,
	risks,
	riskTreatments,
	taskBundles,
	tasks,
	trainingAssignments,
	trainingRequirements,
	trainings,
} from "@/db/schema";
import { functionsOf } from "@/lib/compliance/function-holders";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import type { OrgTx } from "@/lib/db/with-org";
import { inDistribution } from "@/lib/documents/distribution";
import { currentVersionsByDocument } from "@/lib/documents/in-force";
import { currentPublished } from "@/lib/documents/versions";
import { userNames } from "./queries";

// Org-gescopte Lesezugriffe für die P2-Register — immer in readOrg/withOrg.

async function withNames<T extends Record<string, unknown>>(
	tx: OrgTx,
	rows: T[],
	fields: (keyof T)[],
): Promise<(T & { names: Record<string, string | null> })[]> {
	const ids = rows.flatMap((r) =>
		fields.map((f) => r[f] as string | null | undefined),
	);
	const names = await userNames(tx, ids);
	return rows.map((r) => ({
		...r,
		names: Object.fromEntries(
			fields.map((f) => [
				String(f),
				r[f] ? (names.get(r[f] as string) ?? null) : null,
			]),
		),
	}));
}

// ── Risiken ────────────────────────────────────────────────────────────────
export async function listRisks(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(risks)
		.where(eq(risks.organizationId, orgId))
		.orderBy(asc(risks.code));
	return withNames(tx, rows, ["ownerUserId", "assigneeUserId"]);
}

export async function getRisk(tx: OrgTx, orgId: string, riskId: string) {
	const [row] = await tx
		.select()
		.from(risks)
		.where(and(eq(risks.id, riskId), eq(risks.organizationId, orgId)))
		.limit(1);
	if (!row) return null;
	const [treatments, ctrl, ast] = await Promise.all([
		tx
			.select()
			.from(riskTreatments)
			.where(eq(riskTreatments.riskId, riskId))
			.orderBy(asc(riskTreatments.createdAt)),
		tx
			.select({ code: controls.code, title: controls.title })
			.from(riskControls)
			.innerJoin(controls, eq(controls.id, riskControls.controlId))
			.where(eq(riskControls.riskId, riskId)),
		tx
			.select({ id: assets.id, name: assets.name })
			.from(riskAssets)
			.innerJoin(assets, eq(assets.id, riskAssets.assetId))
			.where(eq(riskAssets.riskId, riskId)),
	]);
	const names = await userNames(tx, [
		row.ownerUserId,
		row.assigneeUserId,
		row.acceptedByUserId,
		...treatments.map((t) => t.ownerUserId),
	]);
	return { risk: row, treatments, controls: ctrl, assets: ast, names };
}

export async function listExceptions(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ e: exceptions, controlCode: controls.code })
		.from(exceptions)
		.leftJoin(controls, eq(controls.id, exceptions.controlId))
		.where(eq(exceptions.organizationId, orgId))
		.orderBy(asc(exceptions.validUntil));
	const names = await userNames(
		tx,
		rows.map((r) => r.e.ownerUserId),
	);
	return rows.map((r) => ({
		...r.e,
		controlCode: r.controlCode,
		ownerName: r.e.ownerUserId ? (names.get(r.e.ownerUserId) ?? null) : null,
	}));
}

export async function listLossEvents(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(lossEvents)
		.where(eq(lossEvents.organizationId, orgId))
		.orderBy(desc(lossEvents.occurredAt));
}

// ── Dokumente ──────────────────────────────────────────────────────────────
// Spalten der Dokumentliste: ohne den Text der Arbeitskopie (der wächst mit
// jedem Dokument und steht nur auf der Detailseite)
const { bodyMarkdown: _body, ...DOCUMENT_LIST_COLUMNS } =
	getTableColumns(documents);

export async function listDocuments(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select(DOCUMENT_LIST_COLUMNS)
		.from(documents)
		.where(eq(documents.organizationId, orgId))
		.orderBy(asc(documents.docNumber));
	// gültige Fassung je Dokument (läuft eine neue Fassung, gilt die alte)
	const current = await currentVersionsByDocument(tx, orgId, new Date(), {
		withBody: false,
	});
	return withNames(
		tx,
		rows.map((r) => {
			const c = current.get(r.id);
			return {
				...r,
				current: c
					? { id: c.id, version: c.version, publishedAt: c.publishedAt }
					: null,
			};
		}),
		["ownerUserId", "assigneeUserId"],
	);
}

export async function getDocumentByNumber(
	tx: OrgTx,
	orgId: string,
	docNumber: string,
) {
	const [doc] = await tx
		.select()
		.from(documents)
		.where(
			and(
				eq(documents.organizationId, orgId),
				eq(documents.docNumber, docNumber),
			),
		)
		.limit(1);
	if (!doc) return null;
	const [versions, ctrl, acks] = await Promise.all([
		tx
			.select()
			.from(documentVersions)
			.where(eq(documentVersions.documentId, doc.id))
			.orderBy(desc(documentVersions.createdAt)),
		tx
			.select({ code: controls.code, title: controls.title })
			.from(documentControls)
			.innerJoin(controls, eq(controls.id, documentControls.controlId))
			.where(eq(documentControls.documentId, doc.id)),
		tx
			.select()
			.from(documentAcknowledgements)
			.where(eq(documentAcknowledgements.documentId, doc.id)),
	]);
	const names = await userNames(tx, [
		doc.ownerUserId,
		doc.authorUserId,
		doc.assigneeUserId,
		...versions.map((v) => v.approvedByUserId),
		...acks.map((a) => a.userId),
	]);
	return { doc, versions, controls: ctrl, acks, names };
}

// Offene Kenntnisnahmen eines Users: Dokumente mit gültiger Fassung und
// passender Verteilung, deren gültige Fassung noch nicht bestätigt ist —
// auch während eine neue Fassung in Arbeit ist.
export async function pendingAcknowledgements(
	tx: OrgTx,
	orgId: string,
	userId: string,
	orgRole: string,
) {
	const docs = await tx
		.select({
			id: documents.id,
			docNumber: documents.docNumber,
			title: documents.title,
			distribution: documents.distribution,
		})
		.from(documents)
		.where(eq(documents.organizationId, orgId));
	const functions = functionsOf(await loadAssignments(tx, orgId), userId).map(
		(f) => f.function as string,
	);
	const relevant = docs.filter((d) =>
		inDistribution(d.distribution, { role: orgRole, functions }),
	);
	if (relevant.length === 0) return [];
	const versions = await tx
		.select({
			id: documentVersions.id,
			documentId: documentVersions.documentId,
			version: documentVersions.version,
			approvedAt: documentVersions.approvedAt,
			publishedAt: documentVersions.publishedAt,
			retiredAt: documentVersions.retiredAt,
		})
		.from(documentVersions)
		.where(
			and(
				inArray(
					documentVersions.documentId,
					relevant.map((d) => d.id),
				),
				isNotNull(documentVersions.publishedAt),
			),
		);
	const done = new Set(
		(
			await tx
				.select({ versionId: documentAcknowledgements.documentVersionId })
				.from(documentAcknowledgements)
				.where(
					and(
						eq(documentAcknowledgements.organizationId, orgId),
						eq(documentAcknowledgements.userId, userId),
					),
				)
		).map((a) => a.versionId),
	);
	return relevant.flatMap((d) => {
		const current = currentPublished(
			versions.filter((v) => v.documentId === d.id),
		);
		if (!current || done.has(current.id)) return [];
		return [
			{
				id: d.id,
				docNumber: d.docNumber,
				title: d.title,
				version: current.version,
				distribution: d.distribution,
				versionId: current.id,
			},
		];
	});
}

// ── Vorfälle ───────────────────────────────────────────────────────────────
export async function listIncidents(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(incidents)
		.where(eq(incidents.organizationId, orgId))
		.orderBy(desc(incidents.awareAt));
	return withNames(tx, rows, ["ownerUserId", "assigneeUserId"]);
}

export async function getIncident(
	tx: OrgTx,
	orgId: string,
	incidentId: string,
) {
	const [row] = await tx
		.select()
		.from(incidents)
		.where(
			and(eq(incidents.id, incidentId), eq(incidents.organizationId, orgId)),
		)
		.limit(1);
	if (!row) return null;
	const updates = await tx
		.select()
		.from(incidentUpdates)
		.where(eq(incidentUpdates.incidentId, incidentId))
		.orderBy(desc(incidentUpdates.createdAt));
	const names = await userNames(tx, [
		row.ownerUserId,
		row.assigneeUserId,
		...updates.map((u) => u.authorUserId),
	]);
	return { incident: row, updates, names };
}

// ── Dienstleister & Assets ─────────────────────────────────────────────────
export async function listProviders(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(providers)
		.where(eq(providers.organizationId, orgId))
		.orderBy(asc(providers.name));
	return withNames(tx, rows, ["ownerUserId"]);
}

export async function listAssets(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({ a: assets, providerName: providers.name })
		.from(assets)
		.leftJoin(providers, eq(providers.id, assets.providerId))
		.where(eq(assets.organizationId, orgId))
		.orderBy(asc(assets.name));
	const names = await userNames(
		tx,
		rows.map((r) => r.a.ownerUserId),
	);
	return rows.map((r) => ({
		...r.a,
		providerName: r.providerName,
		ownerName: r.a.ownerUserId ? (names.get(r.a.ownerUserId) ?? null) : null,
	}));
}

// ── Schulungen ─────────────────────────────────────────────────────────────
export async function listTrainings(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(trainings)
		.where(eq(trainings.organizationId, orgId))
		.orderBy(desc(trainings.heldAt));
}
export async function listTrainingRequirements(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(trainingRequirements)
		.where(eq(trainingRequirements.organizationId, orgId))
		.orderBy(asc(trainingRequirements.code));
}
export async function listTrainingAssignments(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(trainingAssignments)
		.where(eq(trainingAssignments.organizationId, orgId));
}

// ── Wirksamkeitstests ──────────────────────────────────────────────────────
export async function listControlTests(
	tx: OrgTx,
	orgId: string,
	implementationId: string,
) {
	const rows = await tx
		.select()
		.from(controlTests)
		.where(
			and(
				eq(controlTests.organizationId, orgId),
				eq(controlTests.implementationId, implementationId),
			),
		)
		.orderBy(desc(controlTests.testedAt));
	return withNames(tx, rows, ["testerUserId"]);
}

export async function listTaskBundles(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(taskBundles)
		.where(eq(taskBundles.organizationId, orgId))
		.orderBy(asc(taskBundles.code));
}

// ── Aktivität (Org-Feed) ───────────────────────────────────────────────────
export async function orgActivity(tx: OrgTx, orgId: string, limit = 100) {
	const [audit, recentComments] = await Promise.all([
		tx
			.select()
			.from(auditLog)
			.where(eq(auditLog.organizationId, orgId))
			.orderBy(desc(auditLog.seq))
			.limit(limit),
		tx
			.select()
			.from(comments)
			.where(eq(comments.organizationId, orgId))
			.orderBy(desc(comments.createdAt))
			.limit(limit),
	]);
	const names = await userNames(tx, [
		...audit.map((a) => a.actorUserId),
		...recentComments.map((c) => c.authorUserId),
	]);
	return { audit, comments: recentComments, names };
}

// Maßnahmenplan über alle Risiken (Reiter /risiken?tab=massnahmen, Bericht).
// Der Status kommt aus der verknüpften Aufgabe, nicht aus risk_treatments.
export async function listRiskMeasures(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			id: riskTreatments.id,
			title: riskTreatments.title,
			ownerUserId: riskTreatments.ownerUserId,
			dueAt: riskTreatments.dueAt,
			costEur: riskTreatments.costEur,
			treatmentStatus: riskTreatments.status,
			taskId: riskTreatments.taskId,
			taskStatus: tasks.status,
			riskId: risks.id,
			riskCode: risks.code,
			riskTitle: risks.title,
			likelihood: risks.likelihood,
			impact: risks.impact,
			residualLikelihood: risks.residualLikelihood,
			residualImpact: risks.residualImpact,
			treatment: risks.treatment,
		})
		.from(riskTreatments)
		.innerJoin(risks, eq(risks.id, riskTreatments.riskId))
		.leftJoin(tasks, eq(tasks.id, riskTreatments.taskId))
		.where(eq(riskTreatments.organizationId, orgId))
		.orderBy(asc(riskTreatments.dueAt), asc(risks.code));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
		// Aufgabe führt; ohne Aufgabe der gespeicherte Stand
		status:
			r.taskStatus === "done"
				? "done"
				: r.taskStatus === "doing" || r.taskStatus === "blocked"
					? "in_progress"
					: r.taskStatus === "todo"
						? "planned"
						: r.treatmentStatus,
	}));
}
