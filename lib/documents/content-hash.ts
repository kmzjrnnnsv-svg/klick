import { createHash } from "node:crypto";

// Prüfsumme einer Dokumentfassung: Text und Prüfsumme der Datei. Gespeichert
// beim Einreichen; ändert sich danach etwas, ist es eine neue Fassung.
export function versionContentHash(
	body: string | null,
	fileSha256: string | null,
): string {
	return createHash("sha256")
		.update(
			JSON.stringify({ v: 1, body: body ?? "", file: fileSha256 ?? null }),
		)
		.digest("hex");
}
