import { and, eq } from "drizzle-orm";
import { evidenceBlobs } from "@/db/schema";
import { decryptBytes, unpackEnvelope, unwrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { contentDisposition } from "@/lib/http/disposition";
import { evidenceAad, isDbStorageKey } from "./aad";

// Gegenstück zu storeEncryptedEvidence: Objekt holen, mit der Org-DEK
// entschlüsseln. Zugriffsprüfung und Audit macht die aufrufende Route.

// Objekte in der Datenbank (db:<id>) liest die aufrufende Route im
// Org-Kontext (RLS) und reicht den Umschlag als `packed` weiter; S3-Objekte
// holt decryptEvidenceObject selbst.
export async function dbEnvelope(
	tx: OrgTx,
	orgId: string,
	evidenceId: string,
	storageKey: string | null,
): Promise<Uint8Array | undefined> {
	if (!storageKey || !isDbStorageKey(storageKey)) return undefined;
	const [b] = await tx
		.select({ envelope: evidenceBlobs.envelope })
		.from(evidenceBlobs)
		.where(
			and(
				eq(evidenceBlobs.organizationId, orgId),
				eq(evidenceBlobs.evidenceId, evidenceId),
			),
		)
		.limit(1);
	if (!b) throw new Error(`evidence blob missing: ${evidenceId}`);
	return b.envelope;
}

export async function decryptEvidenceObject(input: {
	evidenceId: string;
	storageKey: string;
	dek: { wrapped: string; keyVersion: number };
	packed?: Uint8Array;
}): Promise<Uint8Array> {
	let packed = input.packed;
	if (!packed) {
		if (isDbStorageKey(input.storageKey))
			throw new Error("db envelope must be loaded in org context");
		const { getBytes } = await import("@/lib/storage/s3");
		packed = await getBytes(input.storageKey);
	}
	const dek = await unwrapDek(input.dek);
	return decryptBytes(
		unpackEnvelope(packed),
		dek,
		evidenceAad(input.evidenceId),
	);
}

// Download-Kopfzeilen: immer Anhang, nie inline im Origin der App rendern.
export function attachmentHeaders(
	fileName: string,
	contentType: string,
	length: number,
): Record<string, string> {
	return {
		"Content-Type": contentType,
		"Content-Disposition": contentDisposition(fileName),
		"Content-Length": String(length),
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "sandbox",
	};
}
