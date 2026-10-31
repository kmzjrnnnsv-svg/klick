import {
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "./catalog";
import {
	type ParamTopic,
	paramFindings,
	paramTable,
	requirementParams,
	type SourcedParam,
	strictness,
} from "./params";

// Wer verlangt eine Maßnahme – und was genau? (Teil Z4, rein). Aus den
// Kanten Maßnahme ↔ Anforderung je Rahmenwerk: welche Anforderungen, ganz
// oder nur teilweise (mit Notiz), Fristen und Turnus je Rahmenwerk mit der
// strengsten Vorgabe, Widersprüche. Die Sätze baut die Oberfläche aus
// Textbausteinen (messages), damit alles in einfacher Sprache bleibt.

export type RelationRequirement = {
	key: string;
	code: string;
	title: string;
	coverage: "full" | "partial";
	note: string | null;
};

export type RelationFramework = {
	slug: string;
	name: string;
	requirements: RelationRequirement[];
	// alle Anforderungen voll abgedeckt
	full: boolean;
};

export type RelationTopic = {
	topic: ParamTopic;
	perFramework: { slug: string; param: SourcedParam }[];
	// Rahmenwerke mit der strengsten Vorgabe
	strictest: string[];
	differs: boolean;
};

export type ControlRelations = {
	control: string;
	frameworks: RelationFramework[];
	topics: RelationTopic[];
	conflicts: { hint: string; frameworks: string[] }[];
};

export type RelationOptions = {
	// nur diese Rahmenwerke (z. B. die der Org); fehlt = alle
	frameworks?: readonly string[];
	// Anforderung → anwendbar; false blendet sie aus
	applicability?: ReadonlyMap<string, boolean>;
};

const fwOf = (key: string) => key.slice(0, key.indexOf(":"));

export function controlRelations(
	control: string,
	opts: RelationOptions = {},
): ControlRelations {
	const only = opts.frameworks ? new Set(opts.frameworks) : null;
	const byFw = new Map<string, RelationRequirement[]>();
	const sourced: SourcedParam[] = [];
	for (const e of EDGES_BY_CONTROL.get(control) ?? []) {
		const slug = fwOf(e.requirement);
		if (only && !only.has(slug)) continue;
		if (opts.applicability?.get(e.requirement) === false) continue;
		const req = REQUIREMENT_BY_KEY.get(e.requirement);
		if (!req || req.legalStatus === "repealed") continue;
		const list = byFw.get(slug) ?? [];
		if (!list.some((r) => r.key === e.requirement))
			list.push({
				key: e.requirement,
				code: req.code,
				title: req.title,
				coverage: e.coverage,
				note: e.note ?? null,
			});
		byFw.set(slug, list);
		sourced.push(...requirementParams(req, e.requirement));
	}

	const frameworks: RelationFramework[] = [...byFw.entries()]
		.map(([slug, requirements]) => {
			const meta = FRAMEWORK_BY_SLUG.get(slug);
			return {
				slug,
				name: meta?.name ?? slug,
				requirements: requirements.sort((a, b) =>
					a.code.localeCompare(b.code, "de", { numeric: true }),
				),
				full: requirements.every((r) => r.coverage === "full"),
				sortOrder: meta?.sortOrder ?? 999,
			};
		})
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map(({ sortOrder: _s, ...f }) => f);

	const topics: RelationTopic[] = paramTable(sourced).map((row) => {
		// je Rahmenwerk die eigene strengste Vorgabe
		const perFramework = row.perFramework.flatMap((f) => {
			const param = f.params[0];
			return param ? [{ slug: f.framework, param }] : [];
		});
		const best = Math.min(...perFramework.map((p) => strictness(p.param)));
		return {
			topic: row.topic,
			perFramework,
			strictest: perFramework
				.filter((p) => strictness(p.param) === best)
				.map((p) => p.slug),
			differs: row.differs,
		};
	});

	const conflicts = paramFindings(sourced).flatMap((f) =>
		f.kind === "conflict"
			? [
					{
						hint: f.hint,
						frameworks: [...new Set(f.params.map((p) => fwOf(p.source)))],
					},
				]
			: [],
	);

	return { control, frameworks, topics, conflicts };
}

// Wie viele Rahmenwerke verlangen eine Maßnahme? Für Übersicht und Listen
export function sharedBy(
	control: string,
	opts: RelationOptions = {},
): string[] {
	return controlRelations(control, opts).frameworks.map((f) => f.slug);
}
