// Fingerabdruck des NDA-Texts (nur Server: node:crypto). Getrennt von
// rules.ts, das auch Browser-Bausteine importieren.
import { createHash } from "node:crypto";

// Fingerabdruck des NDA-Texts: die Anfrage speichert, welcher Fassung
// zugestimmt wurde.
export function ndaVersion(text: string): string {
	return createHash("sha256")
		.update(text.trim(), "utf8")
		.digest("hex")
		.slice(0, 16);
}
