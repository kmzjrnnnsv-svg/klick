import { and, desc, eq, inArray } from "drizzle-orm";
import {
	accessTokens,
	assessmentAnswers,
	assessments,
	assets,
	evidence,
	processes,
	processProviders,
	providers,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { userNames } from "./queries";

// Lieferantenbewertung (S6): Detailseite des Dienstleisters und Portalansicht.

export async function getProviderDetail(tx: OrgTx, orgId: string, id: string) {
	const [p] = await tx
		.select()
		.from(providers)
		.where(and(eq(providers.id, id), eq(providers.organizationId, orgId)))
		.limit(1);
	if (!p) return null;
	const [list, procs, assetRows] = await Promise.all([
		tx
			.select()
			.from(assessments)
			.where(
				and(
					eq(assessments.organizationId, orgId),
					eq(assessments.subjectType, "provider"),
					eq(assessments.subjectId, id),
				),
			)
			.orderBy(desc(assessments.createdAt)),
		tx
			.select({
				code: processes.code,
				name: processes.name,
				criticality: processes.criticality,
			})
			.from(processProviders)
			.innerJoin(processes, eq(processes.id, processProviders.processId))
			.where(
				and(
					eq(processProviders.organizationId, orgId),
					eq(processProviders.providerId, id),
				),
			),
		tx
			.select({ id: assets.id, name: assets.name, type: assets.type })
			.from(assets)
			.where(and(eq(assets.organizationId, orgId), eq(assets.providerId, id))),
	]);
	const ids = list.map((a) => a.id);
	const [tokens, answers] =
		ids.length === 0
			? [[], []]
			: await Promise.all([
					tx
						.select({
							subjectId: accessTokens.subjectId,
							prefix: accessTokens.prefix,
							expiresAt: accessTokens.expiresAt,
							revokedAt: accessTokens.revokedAt,
							lastUsedAt: accessTokens.lastUsedAt,
							createdAt: accessTokens.createdAt,
						})
						.from(accessTokens)
						.where(
							and(
								eq(accessTokens.organizationId, orgId),
								eq(accessTokens.kind, "supplier_portal"),
								inArray(accessTokens.subjectId, ids),
							),
						)
						.orderBy(desc(accessTokens.createdAt)),
					tx
						.select({
							assessmentId: assessmentAnswers.assessmentId,
							answer: assessmentAnswers.answer,
							evidenceIds: assessmentAnswers.evidenceIds,
						})
						.from(assessmentAnswers)
						.where(inArray(assessmentAnswers.assessmentId, ids)),
				]);
	const evidenceIds = [...new Set(answers.flatMap((a) => a.evidenceIds))];
	const files =
		evidenceIds.length === 0
			? []
			: await tx
					.select({
						id: evidence.id,
						title: evidence.title,
						fileName: evidence.fileName,
						classification: evidence.classification,
						source: evidence.source,
						validUntil: evidence.validUntil,
						createdAt: evidence.createdAt,
					})
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							inArray(evidence.id, evidenceIds),
						),
					)
					.orderBy(desc(evidence.createdAt));
	const answered = new Map<string, number>();
	for (const a of answers)
		if (a.answer !== null)
			answered.set(a.assessmentId, (answered.get(a.assessmentId) ?? 0) + 1);
	const names = await userNames(tx, [p.ownerUserId, p.assigneeUserId]);
	const now = new Date();
	return {
		provider: p,
		names,
		assessments: list.map((a) => {
			const link = tokens.find((t) => t.subjectId === a.id);
			return {
				...a,
				answered: answered.get(a.id) ?? 0,
				link: link
					? {
							prefix: link.prefix,
							expiresAt: link.expiresAt,
							lastUsedAt: link.lastUsedAt,
							active: !link.revokedAt && link.expiresAt > now,
						}
					: null,
			};
		}),
		processes: procs,
		assets: assetRows,
		files,
	};
}

// Portal: nur, was der Lieferant für seinen Fragebogen braucht — keine
// Bewertungsnotizen, keine fremden Nachweise.
export async function getPortalAssessment(
	tx: OrgTx,
	orgId: string,
	assessmentId: string,
) {
	const [a] = await tx
		.select({
			id: assessments.id,
			code: assessments.code,
			title: assessments.title,
			status: assessments.status,
			questions: assessments.questions,
			dueAt: assessments.dueAt,
			contactName: assessments.contactName,
			submittedAt: assessments.submittedAt,
			result: assessments.result,
		})
		.from(assessments)
		.where(
			and(
				eq(assessments.id, assessmentId),
				eq(assessments.organizationId, orgId),
				eq(assessments.kind, "supplier"),
			),
		)
		.limit(1);
	if (!a) return null;
	const answers = await tx
		.select({
			questionCode: assessmentAnswers.questionCode,
			answer: assessmentAnswers.answer,
			comment: assessmentAnswers.comment,
			naReason: assessmentAnswers.naReason,
			evidenceIds: assessmentAnswers.evidenceIds,
			reviewerVerdict: assessmentAnswers.reviewerVerdict,
		})
		.from(assessmentAnswers)
		.where(eq(assessmentAnswers.assessmentId, a.id));
	const ids = [...new Set(answers.flatMap((x) => x.evidenceIds))];
	const files =
		ids.length === 0
			? []
			: await tx
					.select({
						id: evidence.id,
						fileName: evidence.fileName,
						sizeBytes: evidence.sizeBytes,
					})
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							eq(evidence.source, "supplier_portal"),
							inArray(evidence.id, ids),
						),
					);
	const reopenNote =
		typeof a.result?.reopenNote === "string" ? a.result.reopenNote : null;
	return {
		assessment: { ...a, result: undefined, reopenNote },
		answers: answers.map((x) => ({
			questionCode: x.questionCode,
			answer: x.answer,
			comment: x.comment,
			naReason: x.naReason,
			evidenceIds: x.evidenceIds,
			// „Bitte klären“ aus der Bewertung — nur das Kennzeichen, nie die Notiz
			clarify: x.reviewerVerdict === "clarify",
		})),
		files,
	};
}
