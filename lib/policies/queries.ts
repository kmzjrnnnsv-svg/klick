import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
	documentAcknowledgements,
	documents,
	documentVersions,
	evidence,
} from "@/db/schema";
import { functionsOf } from "@/lib/compliance/function-holders";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import type { OrgTx } from "@/lib/db/with-org";
import { inDistribution } from "@/lib/documents/distribution";
import { currentPublished } from "@/lib/documents/versions";
import { currentEvidence } from "@/lib/evidence/current";

// Richtlinien für Mitarbeitende (/richtlinien): je Dokument die gültige
// Fassung, wenn der Verteiler die Person erreicht (Rolle oder Funktion) und
// das Dokument nicht vertraulich ist; dazu die für Mitarbeitende
// freigegebenen Nachweise (aktuelle Fassung, öffentlich/intern).

const OPEN = ["public", "internal"] as const;

export type PolicyItem = {
	documentId: string;
	docNumber: string;
	title: string;
	type: string;
	versionId: string;
	version: string;
	publishedAt: Date;
	bodyMarkdown: string | null;
	fileEvidenceId: string | null;
	acknowledgedAt: Date | null;
};

export type SharedEvidence = {
	id: string;
	title: string;
	description: string | null;
	fileName: string | null;
	url: string | null;
	validUntil: string | null;
};

export async function policiesFor(
	tx: OrgTx,
	orgId: string,
	viewer: { userId: string; role: string },
): Promise<PolicyItem[]> {
	const functions = functionsOf(
		await loadAssignments(tx, orgId),
		viewer.userId,
	).map((f) => f.function as string);
	const docs = (
		await tx
			.select({
				id: documents.id,
				docNumber: documents.docNumber,
				title: documents.title,
				type: documents.type,
				distribution: documents.distribution,
			})
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, orgId),
					inArray(documents.classification, [...OPEN]),
				),
			)
	).filter((d) =>
		inDistribution(d.distribution, { role: viewer.role, functions }),
	);
	if (docs.length === 0) return [];
	const versions = await tx
		.select({
			id: documentVersions.id,
			documentId: documentVersions.documentId,
			version: documentVersions.version,
			approvedAt: documentVersions.approvedAt,
			publishedAt: documentVersions.publishedAt,
			retiredAt: documentVersions.retiredAt,
			bodyMarkdown: documentVersions.bodyMarkdown,
			fileEvidenceId: documentVersions.fileEvidenceId,
		})
		.from(documentVersions)
		.where(
			and(
				inArray(
					documentVersions.documentId,
					docs.map((d) => d.id),
				),
				isNotNull(documentVersions.publishedAt),
			),
		);
	const acks = new Map(
		(
			await tx
				.select({
					versionId: documentAcknowledgements.documentVersionId,
					at: documentAcknowledgements.acknowledgedAt,
				})
				.from(documentAcknowledgements)
				.where(
					and(
						eq(documentAcknowledgements.organizationId, orgId),
						eq(documentAcknowledgements.userId, viewer.userId),
					),
				)
		).map((a) => [a.versionId, a.at]),
	);
	return docs
		.flatMap((d) => {
			const cur = currentPublished(
				versions.filter((v) => v.documentId === d.id),
			);
			if (!cur?.publishedAt) return [];
			return [
				{
					documentId: d.id,
					docNumber: d.docNumber,
					title: d.title,
					type: d.type,
					versionId: cur.id,
					version: cur.version,
					publishedAt: cur.publishedAt,
					bodyMarkdown: cur.bodyMarkdown,
					fileEvidenceId: cur.fileEvidenceId,
					acknowledgedAt: acks.get(cur.id) ?? null,
				},
			];
		})
		.sort((a, b) => a.docNumber.localeCompare(b.docNumber, "de"));
}

export async function sharedEvidence(
	tx: OrgTx,
	orgId: string,
): Promise<SharedEvidence[]> {
	return tx
		.select({
			id: evidence.id,
			title: evidence.title,
			description: evidence.description,
			fileName: evidence.fileName,
			url: evidence.url,
			validUntil: evidence.validUntil,
		})
		.from(evidence)
		.where(
			and(
				eq(evidence.organizationId, orgId),
				eq(evidence.staffVisible, true),
				inArray(evidence.classification, [...OPEN]),
				currentEvidence(),
			),
		)
		.orderBy(evidence.title);
}
