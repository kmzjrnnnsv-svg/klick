import { describe, expect, it } from "vitest";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import {
	CATALOG_FRAMEWORKS,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import {
	articleBySlug,
	articlesByArea,
	articlesFor,
	HELP_ARTICLES,
	searchHelp,
} from "@/lib/help";
import { HELP_ICONS } from "@/lib/help/icons";
import {
	HELP_FALLBACK,
	HELP_ROUTES,
	helpSlugForPath,
	routesForArticle,
} from "@/lib/help/routes";
import { HELP_AREAS, type HelpArticle } from "@/lib/help/types";
import { buildNav } from "@/lib/nav";

// Abschnitte, die die Artikelseite selbst anlegt (Anker)
const RESERVED_IDS = ["rollen", "automatik", "fragen", "normen"];

function texts(a: HelpArticle): string[] {
	return [
		a.title,
		a.summary,
		...a.sections.flatMap((s) => [
			s.heading,
			...(s.body ?? []),
			...(s.steps ?? []),
			...(s.list ?? []),
			...(s.tip ? [s.tip] : []),
		]),
		...(a.roles ?? []),
		...(a.automation ?? []),
		...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
		...(a.norms ?? []).map((n) => n.why),
	];
}

// Alle Seiten, die die Navigation in irgendeiner Org zeigen kann
function allNavHrefs(): string[] {
	const hrefs = new Set<string>();
	for (const role of ORG_ROLES)
		for (const walletLinked of [false, true])
			for (const g of buildNav({
				frameworks: CATALOG_FRAMEWORKS.map((f) => ({
					slug: f.slug,
					name: f.name,
				})),
				licenceStage: "4_bank",
				caspServices: ["custody"],
				role,
				walletLinked,
			}))
				for (const i of g.items) hrefs.add(i.href);
	return [...hrefs];
}

describe("Hilfe-Artikel", () => {
	it("Schlüssel eindeutig, jeder Bereich belegt", () => {
		const slugs = HELP_ARTICLES.map((a) => a.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const area of HELP_AREAS)
			expect(HELP_ARTICLES.some((a) => a.area === area)).toBe(true);
		expect(articlesByArea(HELP_ARTICLES).map((g) => g.area)).toEqual(
			HELP_AREAS,
		);
	});

	it("Normbezüge stehen im Katalog", () => {
		const missing = HELP_ARTICLES.flatMap((a) =>
			(a.norms ?? [])
				.filter((n) => !REQUIREMENT_BY_KEY.has(n.key))
				.map((n) => `${a.slug}: ${n.key}`),
		);
		expect(missing).toEqual([]);
	});

	it("Querverweise und Symbole zeigen auf vorhandene Artikel", () => {
		for (const a of HELP_ARTICLES) {
			for (const r of a.related ?? []) {
				expect(articleBySlug(r), `${a.slug} → ${r}`).toBeDefined();
				expect(r).not.toBe(a.slug);
			}
			expect(HELP_ICONS[a.slug], a.slug).toBeDefined();
		}
		expect(Object.keys(HELP_ICONS).sort()).toEqual(
			HELP_ARTICLES.map((a) => a.slug).sort(),
		);
	});

	it("Anker je Artikel eindeutig und nicht reserviert", () => {
		for (const a of HELP_ARTICLES) {
			const ids = a.sections.map((s) => s.id);
			expect(new Set(ids).size, a.slug).toBe(ids.length);
			for (const id of ids) {
				expect(RESERVED_IDS, `${a.slug}#${id}`).not.toContain(id);
				expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
			}
		}
	});

	it("Texte ohne Geviertstrich, ohne „wir“, Abschnitte mit Inhalt", () => {
		for (const a of HELP_ARTICLES) {
			for (const s of texts(a)) {
				expect(s, a.slug).not.toMatch(/—/);
				expect(s, a.slug).not.toMatch(/\b(wir|uns|unser\w*)\b/i);
				expect(s.trim(), a.slug).not.toBe("");
			}
			for (const s of a.sections)
				expect(
					(s.body?.length ?? 0) +
						(s.steps?.length ?? 0) +
						(s.list?.length ?? 0),
					`${a.slug}#${s.id}`,
				).toBeGreaterThan(0);
		}
	});
});

describe("Hilfe zu dieser Seite", () => {
	it("jede Seite der Navigation hat einen eigenen Artikel", () => {
		const unmapped = allNavHrefs().filter(
			(href) =>
				!HELP_ROUTES.some(([p]) => href === p || href.startsWith(`${p}/`)),
		);
		expect(unmapped).toEqual([]);
		for (const href of allNavHrefs())
			expect(articleBySlug(helpSlugForPath(href)), href).toBeDefined();
	});

	it("Zuordnung zeigt nur auf Artikel, längster Pfad gewinnt", () => {
		for (const [, slug] of HELP_ROUTES)
			expect(articleBySlug(slug), slug).toBeDefined();
		expect(articleBySlug(HELP_FALLBACK)).toBeDefined();
		expect(helpSlugForPath("/heute/freigaben")).toBe("freigaben");
		expect(helpSlugForPath("/heute/aufgaben")).toBe("heute");
		expect(helpSlugForPath("/risiken/123")).toBe("risiken");
		expect(helpSlugForPath("/rahmenwerke/dora/Art.30")).toBe("rahmenwerke");
		expect(helpSlugForPath("/irgendwas")).toBe(HELP_FALLBACK);
		expect(helpSlugForPath("/heutemorgen")).toBe(HELP_FALLBACK);
		expect(routesForArticle("heute")).toEqual(["/heute", "/heute/aufgaben"]);
		expect(routesForArticle("erste-schritte")).not.toContain("/hilfe");
		expect(routesForArticle("casp")).toContain("/verwahrung");
	});
});

describe("Hilfe für Mitarbeitende", () => {
	it("sehen nur ihre Artikel, alle anderen alles", () => {
		const mine = articlesFor("employee");
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.every((a) => a.audience === "employee")).toBe(true);
		expect(mine.map((a) => a.slug)).toContain("richtlinien");
		expect(articlesFor("viewer")).toHaveLength(HELP_ARTICLES.length);
		expect(articlesFor("auditor")).toHaveLength(HELP_ARTICLES.length);
		// Querverweise der Mitarbeitenden-Artikel bleiben nicht alle sichtbar —
		// die Seite filtert sie; der Einstieg muss aber erreichbar sein
		expect(mine.map((a) => a.slug)).toContain(HELP_FALLBACK);
	});

	it("Hilfe steht für jede Rolle in der Navigation", () => {
		for (const role of ORG_ROLES) {
			const keys = buildNav({
				frameworks: [{ slug: "iso27001", name: "ISO 27001" }],
				licenceStage: "0_vorbereitung",
				caspServices: [],
				role,
			}).flatMap((g) => g.items.map((i) => i.key));
			expect(keys, role).toContain("help");
		}
	});
});

describe("searchHelp", () => {
	it("findet über Titel und Text, ohne Umlaut-Sorgen", () => {
		expect(searchHelp(HELP_ARTICLES, "Passkey")[0]?.slug).toBe("anmeldung");
		expect(
			searchHelp(HELP_ARTICLES, "geldwasche").map((a) => a.slug),
		).toContain("geldwaesche");
		expect(searchHelp(HELP_ARTICLES, "dora:Art.30").length).toBeGreaterThan(0);
		expect(searchHelp(HELP_ARTICLES, "x")).toEqual([]);
		expect(searchHelp(HELP_ARTICLES, "zzzqqq")).toEqual([]);
		// Mitarbeitende finden nur ihre Artikel
		expect(
			searchHelp(articlesFor("employee"), "Risiko").every(
				(a) => a.audience === "employee",
			),
		).toBe(true);
	});
});
