import type { AssessmentQuestion } from "@/db/schema/enums";
import { exclusionAllowedForKey, naImpact } from "@/lib/compliance/exclusions";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";

type Lookup = Pick<OrgCatalog, "frameworkBySlug" | "requirementByKey">;

// „Nicht relevant“ in der Gap-Analyse aus dem Katalog: erlaubt, wenn
// mindestens eine Anforderung der Frage einen Ausschluss kennt; Fragen
// ohne Katalogbezug (Lieferanten, Produkte) wie bisher immer

function catalogKeys(q: AssessmentQuestion): string[] | null {
	return q.controlCode && (q.requirements?.length ?? 0) > 0
		? (q.requirements ?? [])
		: null;
}

export function naAllowed(q: AssessmentQuestion, catalog?: Lookup): boolean {
	const keys = catalogKeys(q);
	return !keys || keys.some((k) => exclusionAllowedForKey(k, catalog));
}

// Anteil der Frage, der bei „nicht relevant“ offen bleibt
export function naOpenShare(q: AssessmentQuestion, catalog?: Lookup): number {
	const keys = catalogKeys(q);
	if (!keys) return 0;
	return (
		keys.filter((k) => !exclusionAllowedForKey(k, catalog)).length / keys.length
	);
}

export { exclusionAllowedForKey as naExcludable, naImpact };
