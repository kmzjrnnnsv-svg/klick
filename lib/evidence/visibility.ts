import { eq } from "drizzle-orm";
import { documents, documentVersions } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { currentPublished } from "@/lib/documents/versions";

// Prüfer-Sicht beim Download: eine Datei, die zu einem Dokument gehört,
// ist nur abrufbar, wenn sie die Datei der gültigen Fassung ist (nicht die
// eines Entwurfs, einer Prüfung oder einer ersetzten Fassung). Dateien
// ohne Dokument entscheidet der Aufrufer.
export async function documentFileInForce(
	tx: OrgTx,
	evidenceId: string,
): Promise<"none" | "current" | "not_current"> {
	const refs = await tx
		.select({ documentId: documentVersions.documentId })
		.from(documentVersions)
		.where(eq(documentVersions.fileEvidenceId, evidenceId));
	const drafts = await tx
		.select({ id: documents.id })
		.from(documents)
		.where(eq(documents.fileEvidenceId, evidenceId));
	if (refs.length === 0 && drafts.length === 0) return "none";
	const docIds = [...new Set(refs.map((r) => r.documentId))];
	for (const docId of docIds) {
		const versions = await tx
			.select({
				id: documentVersions.id,
				version: documentVersions.version,
				approvedAt: documentVersions.approvedAt,
				publishedAt: documentVersions.publishedAt,
				retiredAt: documentVersions.retiredAt,
				fileEvidenceId: documentVersions.fileEvidenceId,
			})
			.from(documentVersions)
			.where(eq(documentVersions.documentId, docId));
		if (currentPublished(versions)?.fileEvidenceId === evidenceId)
			return "current";
	}
	return "not_current";
}
