import { and, eq, inArray } from "drizzle-orm";
import { evidenceTexts } from "@/db/schema";
import { decryptMany, encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";

// Text hochgeladener Dateien für den Vergleich von Fassungen (Dokumente,
// Nachweise). Gelesen wird nur im isolierten Parser (screenUpload mit
// withText bzw. Job evidence-texts); hier nur Speichern (verschlüsselt mit
// dem Org-DEK) und Lesen. Ein Absatz je Zeile.

export type TextStatus =
	| "ok"
	| "unsupported"
	| "no_text"
	| "encrypted"
	| "error";

export type ExtractedText =
	| { status: "ok"; text: string; truncated: boolean }
	| { status: Exclude<TextStatus, "ok"> };

// Für die Anzeige: „pending“ = noch nicht gelesen (Bestand, Job folgt)
export type FileText =
	| { status: "ok"; text: string; truncated: boolean }
	| { status: Exclude<TextStatus, "ok"> | "pending" };

// Dateien mit Text (Uploads und Dateien von Dokumentfassungen); nur diese
// liest der Job evidence-texts für den Bestand nach
export const TEXT_SOURCES = ["manual", "document"] as const;
export const TEXT_MIMES = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/csv",
] as const;

// Stand für die Anzeige: gespeicherter Text, sonst „wird gelesen“, wenn der
// Job die Datei noch nachliest, sonst „nicht vergleichbar“ (Bild, erzeugt)
export function fileTextOf(
	texts: ReadonlyMap<string, FileText>,
	row: { id: string; mimeType: string | null; source: string },
): FileText {
	const stored = texts.get(row.id);
	if (stored && stored.status !== "pending") return stored;
	const readable =
		(TEXT_SOURCES as readonly string[]).includes(row.source) &&
		(TEXT_MIMES as readonly string[]).includes(row.mimeType ?? "");
	return readable ? { status: "pending" } : { status: "no_text" };
}

export const evidenceTextAad = (id: string) =>
	fieldAad("evidence_texts", id, "text_enc");

// Ergebnis des Parsers (screenResultSchema) in den gespeicherten Stand
export function extractedFrom(
	extraction:
		| {
				status: "ok" | "unsupported" | "error";
				truncated?: boolean;
				reason?: "encrypted" | "no_text";
		  }
		| undefined,
	text: string | undefined,
): ExtractedText {
	if (extraction?.status === "ok" && text !== undefined)
		return { status: "ok", text, truncated: Boolean(extraction.truncated) };
	if (extraction?.status === "unsupported")
		return { status: extraction.reason ?? "unsupported" };
	return { status: extraction ? "error" : "unsupported" };
}

export async function storeEvidenceText(
	tx: OrgTx,
	orgId: string,
	evidenceId: string,
	t: ExtractedText,
): Promise<void> {
	const textEnc =
		t.status === "ok"
			? await encryptJson(tx, orgId, t.text, evidenceTextAad(evidenceId))
			: null;
	const row = {
		organizationId: orgId,
		status: t.status,
		truncated: t.status === "ok" ? t.truncated : false,
		chars: t.status === "ok" ? t.text.length : 0,
		textEnc,
		extractedAt: new Date(),
	};
	await tx
		.insert(evidenceTexts)
		.values({ id: evidenceId, ...row })
		.onConflictDoUpdate({ target: evidenceTexts.id, set: row });
}

export async function evidenceTextsFor(
	tx: OrgTx,
	orgId: string,
	ids: readonly string[],
): Promise<Map<string, FileText>> {
	const out = new Map<string, FileText>();
	const unique = [...new Set(ids)];
	if (unique.length === 0) return out;
	const rows = await tx
		.select()
		.from(evidenceTexts)
		.where(
			and(
				eq(evidenceTexts.organizationId, orgId),
				inArray(evidenceTexts.id, unique),
			),
		);
	const texts = await decryptMany<string>(
		tx,
		orgId,
		rows.map((r) => ({ stored: r.textEnc, aad: evidenceTextAad(r.id) })),
	);
	rows.forEach((r, i) => {
		const text = texts[i];
		out.set(
			r.id,
			r.status === "ok" && typeof text === "string"
				? { status: "ok", text, truncated: r.truncated }
				: { status: r.status === "ok" ? "error" : r.status },
		);
	});
	for (const id of unique) if (!out.has(id)) out.set(id, { status: "pending" });
	return out;
}
