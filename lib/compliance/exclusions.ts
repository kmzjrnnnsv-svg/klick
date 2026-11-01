import {
	EDGES_BY_CONTROL,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "./catalog";
import { shortFrameworkName } from "./framework-names";
import type { OrgCatalog } from "./org-catalog";

// Ausschluss je Rahmenwerk (pure): nur wo das Rahmenwerk ihn kennt
// (ExclusionPolicy am Rahmenwerk), sonst bleibt die Anforderung anwendbar
// und wird verhältnismäßig umgesetzt. Gilt für den Schalter an der
// Anforderung, „Nicht relevant“ in der Gap-Analyse und den Control-Status
// „nicht anwendbar“.

export type ExclusionRule =
	| { allowed: true; label: string; basis: string }
	| { allowed: false };

// Mit dem Katalog der Org gelten auch eigene Rahmenwerke (R4): dort nach
// ihrer Einstellung „Ausschluss erlaubt“
type Lookup = Pick<OrgCatalog, "frameworkBySlug" | "requirementByKey">;

export function exclusionRule(
	framework: string,
	code: string,
	catalog?: Lookup,
): ExclusionRule {
	const policy = (catalog?.frameworkBySlug ?? FRAMEWORK_BY_SLUG).get(
		framework,
	)?.exclusion;
	if (!policy) return { allowed: false };
	const req = (catalog?.requirementByKey ?? REQUIREMENT_BY_KEY).get(
		`${framework}:${code}`,
	);
	if (!req) return { allowed: false };
	const byPrefix =
		!policy.codePrefixes || policy.codePrefixes.some((p) => code.startsWith(p));
	const bySection =
		!policy.sections || policy.sections.includes(req.sectionCode);
	return byPrefix && bySection
		? { allowed: true, label: policy.label, basis: policy.basis }
		: { allowed: false };
}

export function exclusionAllowedForKey(key: string, catalog?: Lookup): boolean {
	const i = key.indexOf(":");
	if (i < 0) return false;
	return exclusionRule(key.slice(0, i), key.slice(i + 1), catalog).allowed;
}

// Was „Nicht relevant“ für eine Frage bzw. ein Control bewirkt, je
// Anforderung:
//   excludable — das Rahmenwerk kennt einen Ausschluss: wird ausgeschlossen
//   kept       — die Maßnahme trägt sie nur teilweise (Kante „partial“) und
//                eine andere Maßnahme hängt an ihr: die Anforderung bleibt
//                anwendbar und zählt über die anderen; die Maßnahme selbst
//                kann entfallen
//   blocked    — die Maßnahme trägt sie ganz und es gibt keinen Ausschluss:
//                bleibt offen
// „Nicht relevant“ ist wählbar, wenn etwas ausgeschlossen werden kann oder
// nichts offen bliebe (naChoosable).
export type NaImpact = {
	excludable: { key: string; label: string; how: string }[];
	kept: { key: string; label: string }[];
	blocked: { key: string; label: string }[];
};

type EdgeLookup = Partial<
	Pick<OrgCatalog, "edgesByControl" | "edgesByRequirement">
>;

export function naImpact(
	keys: readonly string[],
	catalog?: Lookup & Pick<OrgCatalog, "frameworkBySlug"> & EdgeLookup,
	controlCode?: string | null,
): NaImpact {
	const out: NaImpact = { excludable: [], kept: [], blocked: [] };
	const edges = controlCode
		? ((catalog?.edgesByControl ?? EDGES_BY_CONTROL).get(controlCode) ?? [])
		: [];
	const byRequirement = catalog?.edgesByRequirement ?? EDGES_BY_REQUIREMENT;
	// nur teilweise getragen und eine andere Maßnahme hängt an der Anforderung
	const partial = new Set<string>(
		edges
			.filter(
				(e) =>
					e.coverage === "partial" &&
					(byRequirement.get(e.requirement) ?? []).some(
						(o) => o.control !== controlCode,
					),
			)
			.map((e) => e.requirement),
	);
	for (const key of keys) {
		const i = key.indexOf(":");
		if (i < 0) continue;
		const fw = key.slice(0, i);
		const code = key.slice(i + 1);
		const label = `${shortFrameworkName(fw, catalog)} ${code}`;
		const rule = exclusionRule(fw, code, catalog);
		if (rule.allowed) out.excludable.push({ key, label, how: rule.label });
		else if (partial.has(key)) out.kept.push({ key, label });
		else out.blocked.push({ key, label });
	}
	return out;
}

/** „Nicht relevant“ wählbar: Ausschluss möglich oder nichts bliebe offen */
export function naChoosable(impact: NaImpact): boolean {
	return impact.excludable.length > 0 || impact.blocked.length === 0;
}
