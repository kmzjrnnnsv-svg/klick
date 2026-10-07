import type { DOCUMENT_TYPES } from "@/db/schema/grc";
import type { DocumentNumbering } from "@/db/schema/platform";

// Nummernkreise je Dokumenttyp (RL-001 Richtlinie, VA-012 Verfahren …).
// Reine Funktionen; der Zähler liegt in org_settings.documentNumbering.

export type DocType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_PREFIXES: Record<DocType, string> = {
	policy: "RL",
	procedure: "VA",
	concept: "KZ",
	plan: "PL",
	manual: "HB",
	template: "VL",
	record: "AZ",
	report: "BE",
	contract: "VT",
	form: "FO",
};

export function nextDocNumber(
	numbering: DocumentNumbering | null | undefined,
	type: DocType,
	existing: readonly string[] = [],
): { docNumber: string; numbering: DocumentNumbering } {
	const current = numbering ?? {};
	const entry = current[type] ?? { prefix: DEFAULT_PREFIXES[type], next: 1 };
	// Kollisionen mit bestehenden Nummern (Import) überspringen.
	let n = entry.next;
	const taken = new Set(existing);
	while (taken.has(`${entry.prefix}-${String(n).padStart(3, "0")}`)) n += 1;
	return {
		docNumber: `${entry.prefix}-${String(n).padStart(3, "0")}`,
		numbering: { ...current, [type]: { prefix: entry.prefix, next: n + 1 } },
	};
}

// Versionen major.minor: Entwurf erhöht minor, Veröffentlichung setzt major.
export function bumpVersion(version: string, kind: "minor" | "major"): string {
	const [maj = "0", min = "0"] = version.split(".");
	const major = Number.parseInt(maj, 10) || 0;
	const minor = Number.parseInt(min, 10) || 0;
	return kind === "major" ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

// Typ-Vorschlag aus Dateiname beim Richtlinien-Import.
export function guessDocType(fileName: string): DocType {
	const n = fileName.toLowerCase();
	if (/richtlinie|policy|leitlinie|rl[-_ ]/.test(n)) return "policy";
	if (/verfahren|prozedur|anweisung|procedure|va[-_ ]/.test(n))
		return "procedure";
	if (/konzept|concept|kz[-_ ]/.test(n)) return "concept";
	if (/plan|pl[-_ ]/.test(n)) return "plan";
	if (/handbuch|manual|hb[-_ ]/.test(n)) return "manual";
	if (/vorlage|template|vl[-_ ]/.test(n)) return "template";
	if (/bericht|report|protokoll|be[-_ ]/.test(n)) return "report";
	if (/vertrag|contract|avv|vt[-_ ]/.test(n)) return "contract";
	if (/formular|form|fo[-_ ]/.test(n)) return "form";
	return "record";
}

export function titleFromFileName(fileName: string): string {
	return fileName
		.replace(/\.[a-z0-9]{2,5}$/i, "")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
