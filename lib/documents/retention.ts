import type { DOCUMENT_TYPES } from "@/db/schema/grc";
import type { ValidRange } from "./versions";

// Aufbewahrung und Vernichtung von Dokument-Fassungen (ISO 27001 7.5.3 f,
// AP9.3), rein. Eine Fassung, die gegolten hat, wird nach Ende ihrer
// Gültigkeit noch „Jahre“ aufbewahrt; danach darf sie mit Freigabe vernichtet
// werden. Eine Verlängerung (z. B. laufende Prüfung, Rechtsstreit) schiebt
// das Ende hinaus, nie nach vorn. Vorschläge je Art nach HGB § 257 / AO § 147
// (Verträge, Aufzeichnungen, Berichte 10 Jahre) und GwG § 8 bzw. MiCAR
// Art. 68 Abs. 9 (5 Jahre) — je Org und Dokument anpassen, prüfen.

type DocType = (typeof DOCUMENT_TYPES)[number];

const LONG: readonly DocType[] = ["contract", "record", "report"];

export const RETENTION_MAX_YEARS = 30;

export function suggestedRetentionYears(type: DocType): number {
	return LONG.includes(type) ? 10 : 5;
}

export function retentionYearsOf(doc: {
	type: DocType;
	retentionYears: number | null;
}): number {
	return doc.retentionYears ?? suggestedRetentionYears(doc.type);
}

export type RetentionState =
	| "in_force" // gilt noch
	| "retained" // gilt nicht mehr, Frist läuft
	| "due" // Frist abgelaufen: Vernichtung prüfen
	| "destroyed"
	| "none"; // hat nie gegolten (Entwurf, abgelehnt): keine Lenkung

export type RetentionInfo = {
	state: RetentionState;
	retainUntil: Date | null;
};

const DAY = 86_400_000;

function addYears(d: Date, years: number): Date {
	const out = new Date(d.getTime());
	out.setUTCFullYear(out.getUTCFullYear() + years);
	return out;
}

// Ende der Aufbewahrung einer Fassung: Ende der Gültigkeit + Jahre, oder die
// Verlängerung, wenn sie später liegt
export function retentionOf(
	version: { destroyedAt: Date | null; retainUntil: string | Date | null },
	range: ValidRange | undefined,
	years: number,
	today: Date = new Date(),
): RetentionInfo {
	if (version.destroyedAt) return { state: "destroyed", retainUntil: null };
	if (!range) return { state: "none", retainUntil: null };
	if (range.until === null || range.until.getTime() > today.getTime())
		return { state: "in_force", retainUntil: null };
	const base = addYears(range.until, Math.max(0, years));
	const hold = version.retainUntil ? new Date(version.retainUntil) : null;
	const retainUntil = hold && hold.getTime() > base.getTime() ? hold : base;
	// fällig ab dem Tag nach dem Ende
	const due =
		Math.floor(today.getTime() / DAY) > Math.floor(retainUntil.getTime() / DAY);
	return { state: due ? "due" : "retained", retainUntil };
}

export {
	EXTERNAL_KINDS,
	type ExternalKind,
	type ExternalSource,
} from "@/db/schema/grc";

// Nur http(s)-Adressen anzeigen und verlinken
export function safeExternalUrl(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return u.protocol === "https:" || u.protocol === "http:"
			? u.toString()
			: null;
	} catch {
		return null;
	}
}
