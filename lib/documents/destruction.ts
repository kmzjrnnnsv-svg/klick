import { and, eq, isNotNull, ne } from "drizzle-orm";
import {
	documents,
	documentVersions,
	evidence,
	evidenceSignatures,
	storagePurgeQueue,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { isDbStorageKey } from "@/lib/evidence/aad";
import { purgeAfter } from "@/lib/jobs/storage";
import { retentionOf, retentionYearsOf } from "./retention";
import { validRanges } from "./versions";

// Vernichtung einer Dokument-Fassung nach Ablauf der Aufbewahrung (AP9.3).
// Schreiben nur hier: Text und Datei weg, Prüfsumme, Nummer und Notiz
// bleiben (Trigger document_versions_frozen lässt genau diesen Übergang zu).
// Die Datei geht über die Löschwarteschlange wie ein gelöschter Nachweis,
// sofern keine andere Fassung oder die Arbeitskopie sie noch nutzt und sie
// nicht als Nachweis unterschrieben ist.

export type DestroyError =
	| "notFound"
	| "not_due"
	| "already_destroyed"
	| "in_force";

export type DestroyResult =
	| {
			ok: true;
			// Objektspeicher: Tombstone nach dem Commit schreiben
			purgedEvidenceId: string | null;
			objectInS3: boolean;
			fileKept: boolean;
			audit: AuditInput;
	  }
	| { ok: false; error: DestroyError };

export async function loadVersionRetention(
	tx: OrgTx,
	orgId: string,
	versionId: string,
	today: Date = new Date(),
) {
	const [v] = await tx
		.select()
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.id, versionId),
				eq(documentVersions.organizationId, orgId),
			),
		)
		.limit(1);
	if (!v) return null;
	const [doc] = await tx
		.select()
		.from(documents)
		.where(
			and(eq(documents.id, v.documentId), eq(documents.organizationId, orgId)),
		)
		.limit(1);
	if (!doc) return null;
	const all = await tx
		.select()
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.documentId, doc.id),
				eq(documentVersions.organizationId, orgId),
			),
		);
	const info = retentionOf(
		v,
		validRanges(all).get(v.id),
		retentionYearsOf(doc),
		today,
	);
	return { version: v, doc, info };
}

export async function destroyVersion(
	tx: OrgTx,
	input: {
		orgId: string;
		versionId: string;
		userId: string | null;
		note: string;
		now: Date;
	},
): Promise<DestroyResult> {
	const loaded = await loadVersionRetention(
		tx,
		input.orgId,
		input.versionId,
		input.now,
	);
	if (!loaded) return { ok: false, error: "notFound" };
	const { version: v, doc, info } = loaded;
	if (info.state === "destroyed")
		return { ok: false, error: "already_destroyed" };
	if (info.state === "in_force" || info.state === "none")
		return { ok: false, error: "in_force" };
	if (info.state !== "due") return { ok: false, error: "not_due" };

	await tx
		.update(documentVersions)
		.set({
			destroyedAt: input.now,
			destroyedByUserId: input.userId,
			destructionNote: input.note,
			bodyMarkdown: null,
			fileEvidenceId: null,
		})
		.where(eq(documentVersions.id, v.id));

	let purgedEvidenceId: string | null = null;
	let objectInS3 = false;
	let fileKept = false;
	const fileId = v.fileEvidenceId;
	if (fileId) {
		const [otherVersion] = await tx
			.select({ id: documentVersions.id })
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.organizationId, input.orgId),
					eq(documentVersions.fileEvidenceId, fileId),
					ne(documentVersions.id, v.id),
				),
			)
			.limit(1);
		const [signed] = await tx
			.select({ id: evidenceSignatures.id })
			.from(evidenceSignatures)
			.where(
				and(
					eq(evidenceSignatures.organizationId, input.orgId),
					eq(evidenceSignatures.evidenceId, fileId),
				),
			)
			.limit(1);
		if (otherVersion || signed || doc.fileEvidenceId === fileId) {
			fileKept = true;
		} else {
			const [row] = await tx
				.select({ id: evidence.id, storageKey: evidence.storageKey })
				// evidence:any-version — Datei einer vernichteten Fassung per ID
				.from(evidence)
				.where(
					and(
						eq(evidence.id, fileId),
						eq(evidence.organizationId, input.orgId),
					),
				)
				.limit(1);
			if (row) {
				await tx.delete(evidence).where(eq(evidence.id, row.id));
				purgedEvidenceId = row.id;
				objectInS3 = Boolean(row.storageKey && !isDbStorageKey(row.storageKey));
				if (row.storageKey && objectInS3)
					await tx
						.insert(storagePurgeQueue)
						.values({
							organizationId: input.orgId,
							storageKey: row.storageKey,
							reason: "document_destroyed",
							refId: row.id,
							requestedByUserId: input.userId,
							purgeAfter: purgeAfter(input.now),
						})
						.onConflictDoNothing();
			}
		}
	}
	return {
		ok: true,
		purgedEvidenceId,
		objectInS3,
		fileKept,
		audit: {
			action: "document.version_destroyed",
			target: `document:${doc.id}`,
			before: {
				version: v.version,
				contentSha256: v.contentSha256,
				fileEvidenceId: fileId,
			},
			after: {
				destroyedAt: input.now.toISOString(),
				retainUntil: info.retainUntil?.toISOString().slice(0, 10) ?? null,
				note: input.note,
				fileKept,
			},
		},
	};
}

// Fassungen der Org, deren Aufbewahrung abgelaufen ist (Tick erinnert)
export async function dueDocumentRetention(
	tx: OrgTx,
	orgId: string,
	today: Date,
): Promise<
	{
		docNumber: string;
		title: string;
		version: string;
		retainUntil: Date;
		ownerUserId: string | null;
	}[]
> {
	const docs = await tx
		.select({
			id: documents.id,
			docNumber: documents.docNumber,
			title: documents.title,
			type: documents.type,
			retentionYears: documents.retentionYears,
			ownerUserId: documents.ownerUserId,
		})
		.from(documents)
		.where(eq(documents.organizationId, orgId));
	if (docs.length === 0) return [];
	const versions = await tx
		.select({
			id: documentVersions.id,
			documentId: documentVersions.documentId,
			version: documentVersions.version,
			approvedAt: documentVersions.approvedAt,
			publishedAt: documentVersions.publishedAt,
			retiredAt: documentVersions.retiredAt,
			retainUntil: documentVersions.retainUntil,
			destroyedAt: documentVersions.destroyedAt,
		})
		.from(documentVersions)
		.where(
			and(
				eq(documentVersions.organizationId, orgId),
				isNotNull(documentVersions.publishedAt),
			),
		);
	const byDoc = new Map<string, typeof versions>();
	for (const v of versions)
		byDoc.set(v.documentId, [...(byDoc.get(v.documentId) ?? []), v]);
	const out: Awaited<ReturnType<typeof dueDocumentRetention>> = [];
	for (const d of docs) {
		const list = byDoc.get(d.id) ?? [];
		const ranges = validRanges(list);
		const years = retentionYearsOf(d);
		for (const v of list) {
			const info = retentionOf(v, ranges.get(v.id), years, today);
			if (info.state === "due" && info.retainUntil)
				out.push({
					docNumber: d.docNumber,
					title: d.title,
					version: v.version,
					retainUntil: info.retainUntil,
					ownerUserId: d.ownerUserId,
				});
		}
	}
	return out;
}
