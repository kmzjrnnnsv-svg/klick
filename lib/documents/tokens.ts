// Platzhalter im Kopf der Vorlagen (`{{docNumber}}`, `{{version}}` …)
// ersetzen (Teil 5, Nov 2026). Rein; ersetzt wird beim Anzeigen und im PDF,
// nie im gespeicherten Text: die Prüfsumme einer Fassung bleibt über den
// eingereichten Text, und „Gültig ab“ steht erst mit der Veröffentlichung
// fest. Andere Platzhalter (z. B. `{{domain}}` der security.txt) bleiben.

export type DocumentTokenValues = {
	docNumber: string;
	version: string;
	owner?: string | null;
	approver?: string | null;
	// schon formatiert, z. B. „03.11.2026“; leer = noch nicht veröffentlicht
	effectiveFrom?: string | null;
	nextReviewAt?: string | null;
	org?: string | null;
};

const NOT_YET = "mit der Veröffentlichung";

const DATE = new Intl.DateTimeFormat("de-DE", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	timeZone: "Europe/Berlin",
});

/** Datum für den Kopf, z. B. „03.11.2026“ (Berlin) */
export const formatBerlinDate = (d: Date): string => DATE.format(d);
const NONE = "–";

const TOKEN =
	/\{\{(docNumber|version|owner|approver|effectiveFrom|nextReviewAt|org)\}\}/g;

export function fillDocumentTokens(
	markdown: string,
	v: DocumentTokenValues,
): string {
	return markdown.replace(TOKEN, (_, key: string) => {
		switch (key) {
			case "docNumber":
				return v.docNumber;
			case "version":
				return v.version;
			case "owner":
				return v.owner?.trim() || NONE;
			case "approver":
				return v.approver?.trim() || NONE;
			case "effectiveFrom":
				return v.effectiveFrom?.trim() || NOT_YET;
			case "nextReviewAt":
				return v.nextReviewAt?.trim() || NONE;
			default:
				return v.org?.trim() || NONE;
		}
	});
}
