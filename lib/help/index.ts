// Hilfe-Wiki: alle Artikel, Suche und Sicht je Rolle — rein.

import type { OrgRole } from "@/lib/auth/session-rules";
import { BASICS } from "./articles/basics";
import { CASP } from "./articles/casp";
import { GOVERNANCE } from "./articles/governance";
import { IMPLEMENT } from "./articles/implement";
import { REGISTERS } from "./articles/registers";
import { SETTINGS } from "./articles/settings";
import type { HelpArea, HelpArticle } from "./types";

export const HELP_ARTICLES: readonly HelpArticle[] = [
	...BASICS,
	...IMPLEMENT,
	...REGISTERS,
	...GOVERNANCE,
	...CASP,
	...SETTINGS,
];

const BY_SLUG = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));

export function articleBySlug(slug: string): HelpArticle | undefined {
	return BY_SLUG.get(slug);
}

// Mitarbeitende sehen nur ihre Artikel, alle anderen Rollen alles
export function articleVisible(a: HelpArticle, role: OrgRole): boolean {
	return role !== "employee" || a.audience === "employee";
}

export function articlesFor(role: OrgRole): HelpArticle[] {
	return HELP_ARTICLES.filter((a) => articleVisible(a, role));
}

export function articlesByArea(
	articles: readonly HelpArticle[],
): { area: HelpArea; articles: HelpArticle[] }[] {
	const out = new Map<HelpArea, HelpArticle[]>();
	for (const a of articles) out.set(a.area, [...(out.get(a.area) ?? []), a]);
	return [...out].map(([area, list]) => ({ area, articles: list }));
}

function fold(s: string): string {
	return s
		.toLocaleLowerCase("de-DE")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/ß/g, "ss");
}

function textOf(a: HelpArticle): string {
	return [
		a.title,
		a.summary,
		...a.sections.flatMap((s) => [
			s.heading,
			...(s.body ?? []),
			...(s.steps ?? []),
			...(s.list ?? []),
			s.tip ?? "",
		]),
		...(a.roles ?? []),
		...(a.automation ?? []),
		...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
		...(a.norms ?? []).flatMap((n) => [n.key, n.why]),
	].join(" ");
}

const FOLDED = new Map(HELP_ARTICLES.map((a) => [a.slug, fold(textOf(a))]));

// Alle Wörter müssen vorkommen; Treffer im Titel zuerst
export function searchHelp(
	articles: readonly HelpArticle[],
	query: string,
	limit = 20,
): HelpArticle[] {
	const words = fold(query)
		.split(/\s+/)
		.filter((w) => w.length > 1);
	if (words.length === 0) return [];
	return articles
		.filter((a) => {
			const text = FOLDED.get(a.slug) ?? "";
			return words.every((w) => text.includes(w));
		})
		.map((a) => {
			const head = fold(`${a.title} ${a.summary}`);
			return { a, score: words.filter((w) => head.includes(w)).length };
		})
		.sort((x, y) => y.score - x.score)
		.slice(0, limit)
		.map((x) => x.a);
}
