import type { Domain } from "@/db/schema/enums";
import { CONTROLS } from "@/lib/compliance/catalog/controls";
import type { CatalogControl } from "@/lib/compliance/catalog/types";

// Vorschlag passender Klick-Maßnahmen für eine eigene Anforderung (R4),
// rein: Wortüberlappung mit Titel, Beschreibung, Prüffragen und Hinweisen
// der Controls, Bereich als Bonus. Nur ein Vorschlag, die Person wählt.

const STOP = new Set(
	"der die das und oder ein eine einer eines einem einen ist sind wird werden zu zur zum von vom mit für auf im in an am als auch bei nach über unter aus dass den dem des sich nicht nur je alle jede jeder jedes kein keine mindestens soll sollen muss müssen kann können the and or of to for a an is are be in on with by at as from that this all each any must shall should".split(
		" ",
	),
);

export function tokens(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.split(" ")
		.filter((w) => w.length >= 4 && !STOP.has(w))
		.map(stem);
}

// Grober Wortstamm: häufige Endungen ab, damit „Zugriffe“ und „Zugriff“
// zusammenfallen
function stem(w: string): string {
	for (const end of ["ungen", "ung", "en", "er", "es", "e", "s", "n"])
		if (w.length - end.length >= 4 && w.endsWith(end))
			return w.slice(0, -end.length);
	return w;
}

type Indexed = { control: CatalogControl; words: Map<string, number> };

let INDEX: Indexed[] | null = null;

function index(): Indexed[] {
	if (INDEX) return INDEX;
	INDEX = CONTROLS.map((control) => {
		const words = new Map<string, number>();
		const add = (text: string | undefined, weight: number) => {
			for (const w of tokens(text ?? ""))
				words.set(w, Math.max(words.get(w) ?? 0, weight));
		};
		add(control.title, 3);
		add(control.description, 2);
		for (const q of control.auditQuestions ?? []) add(q, 1);
		for (const h of control.evidenceHints ?? []) add(h, 1);
		return { control, words };
	});
	return INDEX;
}

export type ControlSuggestion = {
	code: string;
	title: string;
	score: number;
	matched: string[];
};

export function suggestControls(
	text: string,
	domain?: Domain,
	limit = 5,
): ControlSuggestion[] {
	const query = [...new Set(tokens(text))];
	if (query.length === 0) return [];
	const out: ControlSuggestion[] = [];
	for (const { control, words } of index()) {
		let score = 0;
		const matched: string[] = [];
		for (const w of query) {
			const weight = words.get(w);
			if (weight) {
				score += weight;
				matched.push(w);
			}
		}
		if (score === 0) continue;
		if (domain && control.domain === domain) score += 2;
		out.push({ code: control.code, title: control.title, score, matched });
	}
	out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
	// Nur, was dem besten Treffer nahekommt (sonst reicht ein einzelnes Wort)
	const floor = Math.max(3, (out[0]?.score ?? 0) * 0.4);
	return out.filter((s) => s.score >= floor).slice(0, limit);
}
