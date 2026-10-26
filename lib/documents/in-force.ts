import { and, eq, isNotNull } from "drizzle-orm";
import { documentVersions } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { currentPublished } from "./versions";

export type CurrentVersion = {
	id: string;
	version: string;
	publishedAt: Date;
	bodyMarkdown: string | null;
	fileEvidenceId: string | null;
};

// Gültige Fassung je Dokument der Organisation (Zeitpunkt asOf)
export async function currentVersionsByDocument(
	tx: OrgTx,
	orgId: string,
	asOf: Date = new Date(),
): Promise<Map<string, CurrentVersion>> {
	const rows = await tx
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
				eq(documentVersions.organizationId, orgId),
				isNotNull(documentVersions.publishedAt),
			),
		);
	const byDoc = new Map<string, typeof rows>();
	for (const r of rows) {
		const list = byDoc.get(r.documentId) ?? [];
		list.push(r);
		byDoc.set(r.documentId, list);
	}
	const out = new Map<string, CurrentVersion>();
	for (const [docId, list] of byDoc) {
		const cur = currentPublished(list, asOf);
		if (cur?.publishedAt)
			out.set(docId, {
				id: cur.id,
				version: cur.version,
				publishedAt: cur.publishedAt,
				bodyMarkdown: cur.bodyMarkdown,
				fileEvidenceId: cur.fileEvidenceId,
			});
	}
	return out;
}
