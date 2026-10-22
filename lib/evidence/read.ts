import { decryptBytes, unpackEnvelope, unwrapDek } from "@/lib/crypto/envelope";
import { evidenceAad } from "./aad";

// Gegenstück zu storeEncryptedEvidence: Objekt holen, mit der Org-DEK
// entschlüsseln. Zugriffsprüfung und Audit macht die aufrufende Route.

export async function decryptEvidenceObject(input: {
	evidenceId: string;
	storageKey: string;
	dek: { wrapped: string; keyVersion: number };
}): Promise<Uint8Array> {
	const { getBytes } = await import("@/lib/storage/s3");
	const packed = await getBytes(input.storageKey);
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
	const safe = fileName.replace(/["\r\n]/g, "") || "download";
	return {
		"Content-Type": contentType,
		"Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
		"Content-Length": String(length),
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "sandbox",
	};
}
