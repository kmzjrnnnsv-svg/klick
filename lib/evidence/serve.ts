import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { evidence, orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { isDbStorageKey } from "./aad";
import { attachmentHeaders, dbEnvelope, decryptEvidenceObject } from "./read";
import { s3Configured } from "./store";

// Datei eines Nachweises ausliefern (Richtlinien für Mitarbeitende,
// freigegebene Nachweise): Laden im Org-Kontext, Entschlüsseln danach.
// Ob die Person die Datei sehen darf, entscheidet der Aufrufer.

export type EvidenceFilePayload = {
	evidenceId: string;
	storageKey: string;
	fileName: string | null;
	mimeType: string | null;
	dek: { wrapped: string; keyVersion: number };
	packed?: Uint8Array;
};

export async function evidenceFileFor(
	tx: OrgTx,
	orgId: string,
	evidenceId: string,
): Promise<EvidenceFilePayload | null> {
	const [e] = await tx
		.select({
			storageKey: evidence.storageKey,
			fileName: evidence.fileName,
			mimeType: evidence.mimeType,
		})
		// evidence:any-version — Datei per ID, Prüfung beim Aufrufer
		.from(evidence)
		.where(and(eq(evidence.id, evidenceId), eq(evidence.organizationId, orgId)))
		.limit(1);
	const [s] = await tx
		.select({
			encryptedDek: orgSettings.encryptedDek,
			keyVersion: orgSettings.keyVersion,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	if (!e?.storageKey || !s) return null;
	if (!isDbStorageKey(e.storageKey) && !s3Configured()) return null;
	return {
		evidenceId,
		storageKey: e.storageKey,
		fileName: e.fileName,
		mimeType: e.mimeType,
		dek: { wrapped: s.encryptedDek, keyVersion: s.keyVersion },
		packed: await dbEnvelope(tx, orgId, evidenceId, e.storageKey),
	};
}

export async function evidenceFileResponse(
	p: EvidenceFilePayload,
	name?: string,
): Promise<NextResponse> {
	const plain = await decryptEvidenceObject({
		evidenceId: p.evidenceId,
		storageKey: p.storageKey,
		dek: p.dek,
		packed: p.packed,
	});
	const ext = p.fileName?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
	return new NextResponse(new Uint8Array(plain), {
		status: 200,
		headers: attachmentHeaders(
			name ? `${name}${ext}` : (p.fileName ?? "datei"),
			p.mimeType ?? "application/octet-stream",
			plain.byteLength,
		),
	});
}
