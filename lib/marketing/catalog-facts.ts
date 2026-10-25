import {
	ALL_REQUIREMENTS,
	CATALOG_FRAMEWORKS,
	EDGES,
	EDGES_BY_REQUIREMENT,
	requirementKey,
	splitRequirementKey,
} from "@/lib/compliance/catalog";
import { CONTROLS } from "@/lib/compliance/catalog/controls";
import { EVIDENCE_KINDS } from "@/lib/compliance/catalog/evidence-kinds";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import type { PickerExample, PickerFramework } from "./synergy";
import { PICKER_FRAMEWORKS } from "./workflows";

// Zahlen für /funktionen aus dem echten Katalog — rein, getestet
// (tests/marketing-workflows.test.ts). Nie von Hand nachtragen.

export function catalogTotals() {
	return {
		frameworks: CATALOG_FRAMEWORKS.length,
		requirements: ALL_REQUIREMENTS.length,
		controls: CONTROLS.length,
		edges: EDGES.length,
	};
}

function controlsByFramework(): Map<string, Set<string>> {
	const by = new Map<string, Set<string>>();
	for (const e of EDGES) {
		const { framework } = splitRequirementKey(e.requirement);
		const set = by.get(framework) ?? new Set<string>();
		set.add(e.control);
		by.set(framework, set);
	}
	return by;
}

// „Art.75“ → „Art. 75“, „§27“ → „§ 27“ (Lesbarkeit, Katalog-Codes bleiben)
function displayCode(code: string): string {
	return code.replace(/^Art\.(?=\d)/, "Art. ").replace(/^§(?=\d)/, "§ ");
}

// Die Anforderung mit den meisten Controls (bei Gleichstand die erste)
function widestRequirement(slug: string): PickerExample | undefined {
	let best: PickerExample | undefined;
	for (const r of ALL_REQUIREMENTS) {
		if (r.framework !== slug) continue;
		const n =
			EDGES_BY_REQUIREMENT.get(requirementKey(slug, r.code))?.length ?? 0;
		if (!best || n > best.controls)
			best = { code: displayCode(r.code), title: r.title, controls: n };
	}
	return best && best.controls > 1 ? best : undefined;
}

export function pickerFrameworks(): PickerFramework[] {
	const by = controlsByFramework();
	return PICKER_FRAMEWORKS.flatMap(({ slug, label }) => {
		const f = CATALOG_FRAMEWORKS.find((x) => x.slug === slug);
		if (!f) return [];
		return [
			{
				slug,
				label,
				requirements: f.requirements.length,
				controls: [...(by.get(slug) ?? [])].sort(),
				example: widestRequirement(slug),
			},
		];
	});
}

// Das Control mit den meisten Anforderungen in den gegebenen Rahmenwerken —
// Beispiel für „ein Control, viele Anforderungen“.
export function busiestControl(slugs: readonly string[]): {
	code: string;
	title: string;
	requirements: number;
	frameworks: string[];
} | null {
	const set = new Set(slugs);
	const reqs = new Map<string, Set<string>>();
	const fws = new Map<string, Set<string>>();
	for (const e of EDGES) {
		const { framework } = splitRequirementKey(e.requirement);
		if (!set.has(framework)) continue;
		(reqs.get(e.control) ?? reqs.set(e.control, new Set()).get(e.control))?.add(
			e.requirement,
		);
		(fws.get(e.control) ?? fws.set(e.control, new Set()).get(e.control))?.add(
			framework,
		);
	}
	let best: string | null = null;
	for (const [code, r] of reqs) {
		const cur = best ? (reqs.get(best)?.size ?? 0) : -1;
		const curFw = best ? (fws.get(best)?.size ?? 0) : -1;
		const f = fws.get(code)?.size ?? 0;
		if (f > curFw || (f === curFw && r.size > cur)) best = code;
	}
	if (!best) return null;
	const control = CONTROLS.find((c) => c.code === best);
	return {
		code: best,
		title: control?.title ?? best,
		requirements: reqs.get(best)?.size ?? 0,
		frameworks: [...(fws.get(best) ?? [])],
	};
}

const ISO_CLAUSES = [
	["4", "Kontext der Organisation"],
	["5", "Führung"],
	["6", "Planung"],
	["7", "Unterstützung"],
	["8", "Betrieb"],
	["9", "Bewertung der Leistung"],
	["10", "Verbesserung"],
] as const;

// Nachweise je Normpunkt der ISO 27001 (Kapitel 4–10) aus dem Katalog der
// Nachweisarten, dazu die übrigen Rahmenwerke, für die dieselben Nachweise
// zählen (Reihenfolge wie im Katalog).
export function evidenceByIsoClause(): {
	clause: string;
	title: string;
	kinds: string[];
	alsoFor: string[];
}[] {
	const order = CATALOG_FRAMEWORKS.map((f) => f.slug);
	return ISO_CLAUSES.map(([clause, title]) => {
		const kinds = EVIDENCE_KINDS.filter((k) =>
			k.requirements.some((r) => {
				const { framework, code } = splitRequirementKey(r);
				return framework === "iso27001" && code.split(".")[0] === clause;
			}),
		);
		const others = new Set(
			kinds.flatMap((k) =>
				k.requirements
					.map((r) => splitRequirementKey(r).framework)
					.filter((f) => f !== "iso27001"),
			),
		);
		return {
			clause,
			title,
			kinds: [...new Set(kinds.map((k) => k.title))],
			alsoFor: [...others]
				.sort((a, b) => order.indexOf(a) - order.indexOf(b))
				.map(shortFrameworkName),
		};
	});
}
