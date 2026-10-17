import type { AssessmentQuestion, Domain } from "@/db/schema/enums";
import { inWorkQueue } from "@/lib/compliance/applicability";
import {
	ALL_REQUIREMENTS,
	CONTROL_BY_CODE,
	EDGES,
} from "@/lib/compliance/catalog";
import { type ProfileInput, toProfile } from "@/lib/compliance/catalog-view";

// Gap-Analyse als Fragebogen, abgeleitet aus dem Katalog: **eine Frage je
// Control**, nicht je Anforderung (Hub-and-Spoke — wer ISO + NIS2 wählt,
// beantwortet die gemeinsamen Controls einmal). Je Frage: Erklärung,
// Prüffragen, Nachweis-Hinweise, Vorlagen, gedeckte Anforderungen. Kapitel
// nach Domäne. Rein; der Schnappschuss landet in assessments.questions.

export const CATALOG_TEMPLATE = "catalog";

export const DOMAIN_TITLES: Record<Domain, string> = {
	governance: "Governance",
	risk: "Risiko",
	asset: "Assets & Informationen",
	access: "Identität & Zugang",
	crypto: "Kryptografie",
	physical: "Physische Sicherheit",
	operations: "Betrieb",
	network: "Netz",
	development: "Entwicklung",
	supplier: "Dienstleister",
	incident: "Vorfälle",
	continuity: "Kontinuität",
	compliance: "Compliance",
	hr: "Personal",
	aml: "Geldwäscheprävention",
	conduct: "Wohlverhalten",
	payments: "Zahlungen",
	custody: "Verwahrung",
	fraud: "Betrugsprävention",
};

const DOMAIN_ORDER = Object.keys(DOMAIN_TITLES) as Domain[];

export type CatalogTemplateInput = ProfileInput & {
	// manuelle Anwendbarkeitsentscheidungen (framework:code → anwendbar)
	manual?: ReadonlyMap<string, boolean>;
	// nur diese Controls (z. B. neu hinzugekommene nach Rahmenwerk-Zuwachs)
	onlyControls?: ReadonlySet<string>;
};

export function catalogQuestions(
	input: CatalogTemplateInput,
): AssessmentQuestion[] {
	const profile = toProfile(input);
	const selected = new Set(input.frameworks);
	const reqKeys = new Set<string>();
	for (const r of ALL_REQUIREMENTS) {
		if (!selected.has(r.framework)) continue;
		const key = `${r.framework}:${r.code}`;
		const m = input.manual?.get(key);
		if (m === true || (m === undefined && inWorkQueue(r, profile)))
			reqKeys.add(key);
	}
	const byControl = new Map<string, { reqs: Set<string>; fws: Set<string> }>();
	for (const e of EDGES) {
		if (!reqKeys.has(e.requirement)) continue;
		if (input.onlyControls && !input.onlyControls.has(e.control)) continue;
		const agg = byControl.get(e.control) ?? {
			reqs: new Set<string>(),
			fws: new Set<string>(),
		};
		agg.reqs.add(e.requirement);
		agg.fws.add(e.requirement.slice(0, e.requirement.indexOf(":")));
		byControl.set(e.control, agg);
	}
	const out: AssessmentQuestion[] = [];
	for (const [code, agg] of byControl) {
		const c = CONTROL_BY_CODE.get(code);
		if (!c) continue;
		out.push({
			code,
			controlCode: code,
			sectionCode: c.domain,
			sectionTitle: DOMAIN_TITLES[c.domain] ?? c.domain,
			text: c.title,
			help: c.description,
			probes: c.auditQuestions?.slice(0, 3),
			requirements: [...agg.reqs].sort(),
			frameworks: [...agg.fws].sort(),
			weight: agg.reqs.size,
			evidenceRequired: true,
			evidenceHints: c.evidenceHints,
			templates: c.templates,
		});
	}
	return out.sort(
		(a, b) =>
			DOMAIN_ORDER.indexOf(a.sectionCode as Domain) -
				DOMAIN_ORDER.indexOf(b.sectionCode as Domain) ||
			b.weight - a.weight ||
			a.code.localeCompare(b.code),
	);
}

// Kapitel in Reihenfolge mit Fragenzahl (für Navigation und Fortschritt).
export function sectionsOf(
	questions: readonly AssessmentQuestion[],
): { code: string; title: string; count: number }[] {
	const out: { code: string; title: string; count: number }[] = [];
	for (const q of questions) {
		const last = out.find((s) => s.code === q.sectionCode);
		if (last) last.count += 1;
		else out.push({ code: q.sectionCode, title: q.sectionTitle, count: 1 });
	}
	return out;
}
