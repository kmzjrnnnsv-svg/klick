import { CONTROL_EXPLAINERS } from "./catalog/control-explainers";
import { controlRelations, type RelationOptions } from "./control-relations";
import { shortFrameworkName } from "./framework-names";
import { formatParam, type ParamTopic } from "./params";

// Zusammenhänge im Ablauf (Teil Z7, rein): ein kurzer Hinweis an der Stelle,
// an der gearbeitet wird (Frage der Gap-Analyse, Nachweis, Einrichtung).
// Serialisierbar, damit Client-Komponenten ihn anzeigen können; Sätze baut
// die Oberfläche aus Textbausteinen.

export type RelationHint = {
	// Was die Maßnahme ist, in Alltagssprache
	simple: string | null;
	// Kurznamen der Rahmenwerke, die die Maßnahme verlangen
	frameworks: string[];
	// Rahmenwerke, die mehr wollen, als die Maßnahme abdeckt
	partial: { name: string; note: string | null }[];
	// Gleiche Maßnahme, andere Strenge: nur Themen, die sich unterscheiden
	strictest: { topic: string; names: string[]; value: string }[];
	conflicts: string[];
};

export function relationHint(
	control: string,
	opts: RelationOptions,
	topicLabel: (topic: ParamTopic) => string,
): RelationHint {
	const rel = controlRelations(control, opts);
	const strictest = rel.topics
		.filter((t) => t.differs && t.perFramework.length > 1)
		.map((t) => {
			const first = t.perFramework.find((p) => t.strictest.includes(p.slug));
			return {
				topic: topicLabel(t.topic),
				names: t.strictest.map(shortFrameworkName),
				value: first ? formatParam(first.param) : "",
			};
		});
	return {
		simple: CONTROL_EXPLAINERS[control]?.what ?? null,
		frameworks: rel.frameworks.map((f) => shortFrameworkName(f.slug)),
		partial: rel.frameworks
			.filter((f) => !f.full)
			.map((f) => ({
				name: shortFrameworkName(f.slug),
				note:
					f.requirements.find((r) => r.coverage === "partial" && r.note)
						?.note ?? null,
			})),
		strictest,
		conflicts: rel.conflicts.map((c) => c.hint),
	};
}

// Wofür zählt ein Nachweis? Vereinigung der Rahmenwerke seiner Maßnahmen
export function evidenceReach(
	controls: readonly string[],
	opts: RelationOptions,
): { frameworks: string[]; controls: number } {
	const slugs = new Set<string>();
	for (const c of controls)
		for (const f of controlRelations(c, opts).frameworks) slugs.add(f.slug);
	return {
		frameworks: [...slugs].map(shortFrameworkName),
		controls: controls.length,
	};
}
