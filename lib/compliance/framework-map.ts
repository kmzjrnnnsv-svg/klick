import {
	CONTROLS,
	EDGES_BY_CONTROL,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "./catalog";
import { THEMES, type Theme, themeOf } from "./catalog/themes";
import { controlRelations } from "./control-relations";
import type { OrgCatalog } from "./org-catalog";
import { type ParamTopic, type SourcedParam, strictness } from "./params";

// Rahmenwerke untereinander (Teil Z5, rein): welche Maßnahmen sie teilen,
// je Thema gebündelt, wo dieselbe Maßnahme verschieden streng ist, wo sie
// sich widersprechen. Dazu die Lage der Übersicht (Z6) als reine Rechnung.

export type MapOptions = {
	// nur diese Rahmenwerke; fehlt = alle
	frameworks?: readonly string[];
	// Anforderung → anwendbar; false blendet sie aus
	applicability?: ReadonlyMap<string, boolean>;
	// Katalog der Org (R4): eigene Rahmenwerke zählen mit
	catalog?: Pick<
		OrgCatalog,
		"edgesByControl" | "requirementByKey" | "frameworkBySlug"
	>;
};

const fwOf = (key: string) => key.slice(0, key.indexOf(":"));

// Rahmenwerk → Maßnahmen, die es verlangt
export function controlsByFramework(
	opts: MapOptions = {},
): Map<string, Set<string>> {
	const only = opts.frameworks ? new Set(opts.frameworks) : null;
	const map = new Map<string, Set<string>>();
	const edgesByControl = opts.catalog?.edgesByControl ?? EDGES_BY_CONTROL;
	const requirementByKey = opts.catalog?.requirementByKey ?? REQUIREMENT_BY_KEY;
	for (const c of CONTROLS) {
		for (const e of edgesByControl.get(c.code) ?? []) {
			const slug = fwOf(e.requirement);
			if (only && !only.has(slug)) continue;
			if (opts.applicability?.get(e.requirement) === false) continue;
			const req = requirementByKey.get(e.requirement);
			if (!req || req.legalStatus === "repealed") continue;
			const set = map.get(slug) ?? new Set<string>();
			set.add(c.code);
			map.set(slug, set);
		}
	}
	return map;
}

export type Overlap = {
	a: string;
	b: string;
	shared: string[];
	onlyA: string[];
	onlyB: string[];
	// Anteil am kleineren Rahmenwerk: 1 = das kleinere steckt ganz im größeren
	share: number;
};

export function overlap(
	a: string,
	b: string,
	map: ReadonlyMap<string, ReadonlySet<string>>,
): Overlap {
	const A = map.get(a) ?? new Set<string>();
	const B = map.get(b) ?? new Set<string>();
	const shared = [...A].filter((c) => B.has(c)).sort();
	const smaller = Math.min(A.size, B.size);
	return {
		a,
		b,
		shared,
		onlyA: [...A].filter((c) => !B.has(c)).sort(),
		onlyB: [...B].filter((c) => !A.has(c)).sort(),
		share: smaller === 0 ? 0 : shared.length / smaller,
	};
}

const bySort = (a: string, b: string) =>
	(FRAMEWORK_BY_SLUG.get(a)?.sortOrder ?? 999) -
	(FRAMEWORK_BY_SLUG.get(b)?.sortOrder ?? 999);

// Paare mit den meisten gemeinsamen Maßnahmen
export function topPairs(
	map: ReadonlyMap<string, ReadonlySet<string>>,
	limit = 8,
): Overlap[] {
	const slugs = [...map.keys()].sort(bySort);
	const out: Overlap[] = [];
	for (let i = 0; i < slugs.length; i += 1)
		for (let j = i + 1; j < slugs.length; j += 1) {
			const o = overlap(slugs[i] as string, slugs[j] as string, map);
			if (o.shared.length > 0) out.push(o);
		}
	return out
		.sort((x, y) => y.shared.length - x.shared.length || y.share - x.share)
		.slice(0, limit);
}

export type ThemeControl = { code: string; frameworks: string[] };
export type ThemeGroup = {
	theme: Theme;
	controls: ThemeControl[];
	// Rahmenwerk → Zahl der Maßnahmen in diesem Thema
	weights: Map<string, number>;
};

// Maßnahmen je Thema mit den Rahmenwerken, die sie verlangen; Maßnahmen
// ohne Rahmenwerk (in der Auswahl) fallen weg
export function themeGroups(opts: MapOptions = {}): ThemeGroup[] {
	const map = controlsByFramework(opts);
	const groups = new Map<Theme, ThemeGroup>(
		THEMES.map((t) => [t, { theme: t, controls: [], weights: new Map() }]),
	);
	for (const c of CONTROLS) {
		const fws = [...map.entries()]
			.filter(([, set]) => set.has(c.code))
			.map(([slug]) => slug)
			.sort(bySort);
		if (fws.length === 0) continue;
		const g = groups.get(themeOf(c)) as ThemeGroup;
		g.controls.push({ code: c.code, frameworks: fws });
		for (const f of fws) g.weights.set(f, (g.weights.get(f) ?? 0) + 1);
	}
	for (const g of groups.values())
		g.controls.sort(
			(x, y) =>
				y.frameworks.length - x.frameworks.length ||
				x.code.localeCompare(y.code),
		);
	return [...groups.values()];
}

export type PairDifference = {
	control: string;
	topic: ParamTopic;
	a: SourcedParam;
	b: SourcedParam;
	stricter: "a" | "b" | "same";
};

// Gleiche Maßnahme, andere Strenge: Fristen und Turnus zweier Rahmenwerke
// an ihren gemeinsamen Maßnahmen
export function pairDifferences(
	a: string,
	b: string,
	map: ReadonlyMap<string, ReadonlySet<string>>,
): PairDifference[] {
	const out: PairDifference[] = [];
	const seen = new Set<string>();
	for (const code of overlap(a, b, map).shared) {
		const rel = controlRelations(code, { frameworks: [a, b] });
		for (const t of rel.topics) {
			const pa = t.perFramework.find((p) => p.slug === a)?.param;
			const pb = t.perFramework.find((p) => p.slug === b)?.param;
			if (!pa || !pb) continue;
			// dieselbe Vorgabe an mehreren Maßnahmen nur einmal
			const key = `${t.topic}|${pa.source}|${pb.source}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const sa = strictness(pa);
			const sb = strictness(pb);
			out.push({
				control: code,
				topic: t.topic,
				a: pa,
				b: pb,
				stricter: sa === sb ? "same" : sa < sb ? "a" : "b",
			});
		}
	}
	return out;
}

// Widersprüche zwischen zwei Rahmenwerken an gemeinsamen Maßnahmen
export function pairConflicts(
	a: string,
	b: string,
	map: ReadonlyMap<string, ReadonlySet<string>>,
): { control: string; hint: string }[] {
	const out: { control: string; hint: string }[] = [];
	for (const code of overlap(a, b, map).shared)
		for (const c of controlRelations(code, { frameworks: [a, b] }).conflicts)
			if (c.frameworks.includes(a) && c.frameworks.includes(b))
				out.push({ control: code, hint: c.hint });
	return out;
}

// ---- Lage der Übersicht (Z6) ----

export type MapPoint = { x: number; y: number; angle: number };
export type MapLayout = {
	width: number;
	height: number;
	center: { x: number; y: number };
	// lx/ly: Beschriftung außen neben dem Knoten
	themes: (MapPoint & {
		theme: Theme;
		lx: number;
		ly: number;
		anchor: "start" | "middle" | "end";
	})[];
	frameworks: (MapPoint & {
		slug: string;
		anchor: "start" | "middle" | "end";
	})[];
};

// Mitte = Firma, innerer Ring = Themen, äußerer Ring = Rahmenwerke.
// Winkel ab 12 Uhr im Uhrzeigersinn; Beschriftung zeigt nach außen.
export function mapLayout(
	frameworks: readonly string[],
	size = { width: 1120, height: 800 },
): MapLayout {
	const cx = size.width / 2;
	const cy = size.height / 2;
	const rTheme = Math.min(cx, cy) * 0.4;
	const rFw = Math.min(cx, cy) * 0.78;
	const at = (r: number, angle: number) => ({
		x: Math.round((cx + r * Math.sin(angle)) * 10) / 10,
		y: Math.round((cy - r * Math.cos(angle)) * 10) / 10,
		angle,
	});
	const themes = THEMES.map((theme, i) => {
		const angle = (2 * Math.PI * i) / THEMES.length;
		const s = Math.sin(angle);
		const anchor: "start" | "middle" | "end" =
			Math.abs(s) < 0.5 ? "middle" : s > 0 ? "start" : "end";
		// oben und unten weiter weg (Schrifthöhe), seitlich knapp neben dem Knoten
		const label = at(rTheme + (anchor === "middle" ? 56 : 44), angle);
		return { theme, ...at(rTheme, angle), lx: label.x, ly: label.y, anchor };
	});
	const sorted = [...frameworks].sort(bySort);
	const n = Math.max(sorted.length, 1);
	const fws = sorted.map((slug, i) => {
		// halber Schritt versetzt, damit Rahmenwerke zwischen den Themen stehen
		const angle = (2 * Math.PI * (i + 0.5)) / n;
		const s = Math.sin(angle);
		const anchor: "start" | "middle" | "end" =
			Math.abs(s) < 0.05 ? "middle" : s > 0 ? "start" : "end";
		return { slug, anchor, ...at(rFw, angle) };
	});
	return {
		width: size.width,
		height: size.height,
		center: { x: cx, y: cy },
		themes,
		frameworks: fws,
	};
}
