import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { assessmentAnswers, assessments, evidence } from "@/db/schema";
import type { AssessmentKind } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import { listEvidenceWithControls, loadImplStatus, userNames } from "./queries";

// Fragebögen (Gap-Analyse, Lieferanten, Produkte) — Lesezugriffe im
// RLS-Kontext.

// Liste ohne den Fragen-Schnappschuss (kann groß sein): Zahl der Fragen und
// der beantworteten rechnet die Datenbank
export async function listAssessments(
	tx: OrgTx,
	orgId: string,
	kind?: AssessmentKind,
) {
	const { questions: _questions, ...columns } = getTableColumns(assessments);
	const rows = await tx
		.select({
			...columns,
			total: sql<number>`json_array_length(${assessments.questions})::int`,
			answered: sql<number>`(select count(*)::int from assessment_answers aa
				where aa.organization_id = ${orgId} and aa.assessment_id = ${assessments.id}
				  and (aa.answer is not null or aa.reviewer_answer is not null))`,
		})
		.from(assessments)
		.where(
			kind
				? and(eq(assessments.organizationId, orgId), eq(assessments.kind, kind))
				: eq(assessments.organizationId, orgId),
		)
		.orderBy(desc(assessments.createdAt));
	if (rows.length === 0) return [];
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function getAssessmentDetail(
	tx: OrgTx,
	orgId: string,
	id: string,
) {
	const [a] = await tx
		.select()
		.from(assessments)
		.where(and(eq(assessments.id, id), eq(assessments.organizationId, orgId)))
		.limit(1);
	if (!a) return null;
	const answers = await tx
		.select()
		.from(assessmentAnswers)
		.where(
			and(
				eq(assessmentAnswers.organizationId, orgId),
				eq(assessmentAnswers.assessmentId, a.id),
			),
		);
	const evidenceIds = [...new Set(answers.flatMap((x) => x.evidenceIds))];
	const evidenceRows =
		evidenceIds.length === 0
			? []
			: await tx
					.select({
						id: evidence.id,
						title: evidence.title,
						fileName: evidence.fileName,
						storageKey: evidence.storageKey,
						classification: evidence.classification,
						dlp: evidence.dlp,
					})
					// evidence:any-version — Belege einer Antwort per ID
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							inArray(evidence.id, evidenceIds),
						),
					);
	const [implStatus, allEvidence] = await Promise.all([
		loadImplStatus(tx, orgId),
		listEvidenceWithControls(tx, orgId),
	]);
	// Nachweise, die schon am Control hängen (zählen für „belegt“ mit)
	const controlEvidence = new Map<string, { id: string; title: string }[]>();
	for (const e of allEvidence)
		for (const code of e.controlCodes) {
			const list = controlEvidence.get(code) ?? [];
			list.push({ id: e.id, title: e.title });
			controlEvidence.set(code, list);
		}
	const names = await userNames(tx, [
		a.ownerUserId,
		a.reviewerUserId,
		...answers.flatMap((x) => [x.answeredByUserId, x.reviewedByUserId]),
	]);
	return {
		assessment: a,
		answers,
		evidence: new Map(evidenceRows.map((e) => [e.id, e])),
		implStatus,
		controlEvidence,
		allEvidence: allEvidence.map((e) => ({
			id: e.id,
			title: e.title,
			controlCodes: e.controlCodes,
		})),
		names,
	};
}
