import type { AssessmentQuestion } from "@/db/schema/enums";
import {
	exclusionAllowedForKey,
	naChoosable,
	naImpact,
} from "@/lib/compliance/exclusions";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";

type Lookup = Pick<OrgCatalog, "frameworkBySlug" | "requirementByKey"> &
	Partial<Pick<OrgCatalog, "edgesByControl" | "edgesByRequirement">>;

// „Nicht relevant“ in der Gap-Analyse aus dem Katalog: wählbar, wenn das
// Rahmenwerk einer Anforderung einen Ausschluss kennt oder die Maßnahme
// keine Anforderung allein trägt (nur „teilweise“ — die Anforderung bleibt,
// andere Maßnahmen decken sie). Fragen ohne Katalogbezug (Lieferanten,
// Produkte) wie bisher immer. Wirken tut es erst mit Bestätigung durch eine
// zweite Person (Auslöser assessment.not_relevant, beim Übernehmen geprüft).

function catalogKeys(q: AssessmentQuestion): string[] | null {
	return q.controlCode && (q.requirements?.length ?? 0) > 0
		? (q.requirements ?? [])
		: null;
}

export function naImpactOf(q: AssessmentQuestion, catalog?: Lookup) {
	return naImpact(catalogKeys(q) ?? [], catalog, q.controlCode);
}

export function naAllowed(q: AssessmentQuestion, catalog?: Lookup): boolean {
	return !catalogKeys(q) || naChoosable(naImpactOf(q, catalog));
}

// Darf das Control bei „nicht relevant“ entfallen? Nur, wenn keine
// Anforderung offen bliebe (alle ausgeschlossen oder anderweitig gedeckt)
export function naDropsControl(
	q: AssessmentQuestion,
	catalog?: Lookup,
): boolean {
	return catalogKeys(q) !== null && naImpactOf(q, catalog).blocked.length === 0;
}

// Anteil der Frage, der bei „nicht relevant“ offen bleibt
export function naOpenShare(q: AssessmentQuestion, catalog?: Lookup): number {
	const keys = catalogKeys(q);
	if (!keys) return 0;
	return naImpactOf(q, catalog).blocked.length / keys.length;
}

export { exclusionAllowedForKey as naExcludable, naImpact };

// Stand der Bestätigung von „Nicht relevant“ (lib/assessments/na-approval.ts);
// hier, damit die Fragekarte (Client) den Typ ohne Server-Code kennt
export type NaConfirmation =
	// bestätigt (oder kein Ablauf aktiv: wirkt wie bisher sofort)
	| { status: "confirmed"; by: string | null; at: string | null }
	| { status: "pending" }
	| { status: "rejected" | "changes"; by: string | null; note: string | null }
	// kein Antrag (vor dieser Regel beantwortet): Übernehmen lässt es offen
	| { status: "missing" }
	// niemand kann bestätigen (z. B. keine Geschäftsleitung bestellt)
	| { status: "blocked"; error: string };
