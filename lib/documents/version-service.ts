import { and, eq, isNull } from "drizzle-orm";
import { documents, documentVersions, evidence } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { versionContentHash } from "./content-hash";
import { bumpVersion } from "./numbering";

type DocRow = Pick<
	typeof documents.$inferSelect,
	"id" | "version" | "bodyMarkdown" | "fileEvidenceId" | "changeSummary"
>;

// Einreichen: Text, Datei und Prüfsumme der Arbeitskopie werden die Fassung.
// Eine Fassung, die schon freigegeben oder veröffentlicht ist, bleibt
// unverändert (Trigger document_versions_frozen); ist die Nummer belegt
// (Altbestand), beginnt eine neue. Liefert die eingereichte Nummer.
export async function snapshotForReview(
	tx: OrgTx,
	orgId: string,
	doc: DocRow,
	userId: string | null,
	note?: string | null,
): Promise<string> {
	let version = doc.version;
	const [existing] = await tx
		.select({
			approvedAt: documentVersions.approvedAt,
			publishedAt: documentVersions.publishedAt,
		})
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.documentId, doc.id),
				eq(documentVersions.version, version),
			),
		)
		.limit(1);
	if (existing && (existing.approvedAt || existing.publishedAt)) {
		version = bumpVersion(version, "minor");
		await tx.update(documents).set({ version }).where(eq(documents.id, doc.id));
	}
	const [file] = doc.fileEvidenceId
		? await tx
				.select({ sha256: evidence.sha256 })
				.from(evidence)
				.where(
					and(
						eq(evidence.id, doc.fileEvidenceId),
						eq(evidence.organizationId, orgId),
					),
				)
				.limit(1)
		: [];
	const snapshot = {
		bodyMarkdown: doc.bodyMarkdown,
		fileEvidenceId: doc.fileEvidenceId,
		changeSummary:
			doc.changeSummary?.trim() || note?.trim() || "Zur Prüfung eingereicht",
		contentSha256: versionContentHash(doc.bodyMarkdown, file?.sha256 ?? null),
	};
	await tx
		.insert(documentVersions)
		.values({
			organizationId: orgId,
			documentId: doc.id,
			version,
			createdByUserId: userId,
			...snapshot,
		})
		.onConflictDoUpdate({
			target: [documentVersions.documentId, documentVersions.version],
			set: snapshot,
			setWhere: and(
				isNull(documentVersions.approvedAt),
				isNull(documentVersions.publishedAt),
			),
		});
	return version;
}

// Freigabe vermerken — einmal je Fassung
export async function markVersionApproved(
	tx: OrgTx,
	documentId: string,
	version: string,
	userId: string | null,
): Promise<void> {
	await tx
		.update(documentVersions)
		.set({ approvedByUserId: userId, approvedAt: new Date() })
		.where(
			and(
				eq(documentVersions.documentId, documentId),
				eq(documentVersions.version, version),
				isNull(documentVersions.approvedAt),
			),
		);
}
