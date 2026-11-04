import { REQUIREMENT_BY_KEY, splitRequirementKey } from "./catalog";
import {
	ADDITION_KINDS,
	type AdditionKind,
	CONTROL_ADDITIONS,
	type KlickPlace,
} from "./catalog/control-additions";
import type { RelationOptions } from "./control-relations";
import { shortFrameworkName } from "./framework-names";

// Kern und Zusätze einer Maßnahme für eine Organisation (Teil K, rein): Ein
// Zusatz erscheint nur, wenn mindestens eine seiner Anforderungen für die Org
// gilt (Rahmenwerk gewählt, nicht aufgehoben, nicht ausgeschlossen); die
// Fundstellen zeigen nur die geltenden. Serialisierbar, damit auch
// Client-Komponenten (Gap-Analyse) die Zusätze zeigen können.

export type AdditionRef = {
	key: string;
	slug: string;
	code: string;
	// Kurzname des Rahmenwerks
	name: string;
};

export type ShownAddition = {
	kind: AdditionKind;
	text: string;
	refs: AdditionRef[];
	where: KlickPlace | null;
};

export type ControlAdditionsView = {
	core: string | null;
	where: KlickPlace | null;
	groups: { kind: AdditionKind; items: ShownAddition[] }[];
	// gepflegte Zusätze, die für die Org nicht gelten
	hidden: number;
};

export function controlAdditions(
	control: string,
	opts: RelationOptions = {},
): ControlAdditionsView {
	const entry = CONTROL_ADDITIONS[control];
	if (!entry) return { core: null, where: null, groups: [], hidden: 0 };
	const requirementByKey = opts.catalog?.requirementByKey ?? REQUIREMENT_BY_KEY;
	const frameworks = opts.frameworks ? new Set(opts.frameworks) : null;
	const applies = (key: string): boolean => {
		const { framework } = splitRequirementKey(key);
		if (frameworks && !frameworks.has(framework)) return false;
		const req = requirementByKey.get(key);
		if (!req || req.legalStatus === "repealed") return false;
		return opts.applicability?.get(key) !== false;
	};
	const shown: ShownAddition[] = [];
	let hidden = 0;
	for (const a of entry.additions) {
		const refs = a.requirements.filter(applies).map((key) => {
			const { framework, code } = splitRequirementKey(key);
			return {
				key,
				slug: framework,
				code,
				name: shortFrameworkName(framework, opts.catalog),
			};
		});
		if (refs.length === 0) {
			hidden++;
			continue;
		}
		shown.push({ kind: a.kind, text: a.text, refs, where: a.where ?? null });
	}
	return {
		core: entry.core,
		where: entry.where ?? null,
		groups: ADDITION_KINDS.map((kind) => ({
			kind,
			items: shown.filter((s) => s.kind === kind),
		})).filter((g) => g.items.length > 0),
		hidden,
	};
}

// Für Hinweise (Gap-Analyse, Aufgabe): je Zusatz Text und Kurznamen der
// Rahmenwerke, ohne Doppel
export function additionLines(view: ControlAdditionsView): {
	kind: AdditionKind;
	text: string;
	names: string[];
	where: KlickPlace | null;
}[] {
	return view.groups.flatMap((g) =>
		g.items.map((i) => ({
			kind: i.kind,
			text: i.text,
			names: [...new Set(i.refs.map((r) => r.name))],
			where: i.where,
		})),
	);
}
