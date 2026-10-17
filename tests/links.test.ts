import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { ENTITY_KINDS } from "@/db/schema/enums";
import { entityHref } from "@/lib/entities/links";
import { APP_SEGMENTS, AUTH_SEGMENTS } from "@/lib/routes";

// Rückfallschutz für tote Links: Route-Inventar aus app/ gegen alle statischen
// Link-Ziele in app/, components/, lib/ (href, link:, route:, redirect …) und
// gegen die ?tab=-Werte der Zielseite.

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

// Öffentliche CMS-Seiten (app/(marketing)/[slug]) — nur diese Slugs zählen,
// sonst passte jeder einstufige Pfad auf [slug].
const CMS_SLUGS = ["impressum", "datenschutz-erklaerung"];

type Route = { pattern: RegExp; file: string; path: string };

function routeInventory(): Route[] {
	const routes: Route[] = [];
	for (const f of walk(join(ROOT, "app"))) {
		const rel = relative(join(ROOT, "app"), f).split(sep).join("/");
		const m = rel.match(/^(.*?)(?:\/)?(page\.tsx|route\.ts)$/);
		if (!m) continue;
		const segs = (m[1] ?? "")
			.split("/")
			.filter((s) => s && !/^\(.+\)$/.test(s));
		const path = `/${segs.join("/")}`;
		if (rel === "(marketing)/[slug]/page.tsx") {
			for (const slug of CMS_SLUGS)
				routes.push({ pattern: new RegExp(`^/${slug}$`), file: f, path });
			continue;
		}
		const re = segs
			.map((s) =>
				s.startsWith("[...")
					? ".+"
					: s.startsWith("[")
						? "[^/]+"
						: s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
			)
			.join("/");
		routes.push({ pattern: new RegExp(`^/${re}$`), file: f, path });
	}
	// Metadaten-Routen (app/robots.ts, app/sitemap.ts)
	routes.push({ pattern: /^\/robots\.txt$/, file: "", path: "/robots.txt" });
	routes.push({ pattern: /^\/sitemap\.xml$/, file: "", path: "/sitemap.xml" });
	return routes;
}

const ROUTES = routeInventory();

function findRoute(path: string): Route | undefined {
	// Statische Routen vor dynamischen ([id]) prüfen.
	const exact = ROUTES.find(
		(r) => !r.path.includes("[") && r.pattern.test(path),
	);
	return exact ?? ROUTES.find((r) => r.pattern.test(path));
}

// Reiter-Werte einer Seite: UrlTabs/Tabs-Werte, TABS-Listen, pickTab-Listen,
// Vergleiche auf `tab`.
function tabValues(file: string): Set<string> {
	const src = readFileSync(file, "utf8");
	const out = new Set<string>();
	for (const re of [
		/value:\s*"([^"]+)"/g,
		/value="([^"]+)"/g,
		/\btab\s*===\s*"([^"]+)"/g,
		/one\(sp\.tab\)\s*===\s*"([^"]+)"/g,
	])
		for (const m of src.matchAll(re)) if (m[1]) out.add(m[1]);
	for (const block of src.matchAll(
		/(?:TABS\s*=\s*\[|pickTab\([^,]+,\s*\[)([^\]]*)\]/g,
	))
		for (const m of (block[1] ?? "").matchAll(/"([^"]+)"/g))
			if (m[1]) out.add(m[1]);
	return out;
}

// Inhalt eines Template-Literals ab `start` (nach dem Backtick); ${…} → "X".
function readTemplate(src: string, start: number): string | null {
	let out = "";
	let i = start;
	while (i < src.length) {
		const ch = src[i];
		if (ch === "`") return out;
		if (ch === "\\") {
			out += src[i + 1] ?? "";
			i += 2;
			continue;
		}
		if (ch === "$" && src[i + 1] === "{") {
			let depth = 1;
			i += 2;
			while (i < src.length && depth > 0) {
				const c = src[i];
				if (c === "{") depth += 1;
				else if (c === "}") depth -= 1;
				else if (c === "`") {
					// verschachteltes Template überspringen
					i += 1;
					while (i < src.length && src[i] !== "`") i += 1;
				}
				i += 1;
			}
			out += "X";
			continue;
		}
		out += ch;
		i += 1;
	}
	return null;
}

type Target = { file: string; target: string };

function staticTargets(): Target[] {
	const files = ["app", "components", "lib"].flatMap((d) =>
		walk(join(ROOT, d)).filter((f) => /\.(ts|tsx)$/.test(f)),
	);
	const out: Target[] = [];
	const lead =
		/(?:href=\{?|href:\s*|link:\s*|route:\s*|redirect\(|router\.(?:push|replace)\(|backHref=\{?)\s*(["`])/g;
	for (const f of files) {
		const src = readFileSync(f, "utf8");
		for (const m of src.matchAll(lead)) {
			const quote = m[1];
			const start = (m.index ?? 0) + m[0].length;
			let value: string | null;
			if (quote === "`") value = readTemplate(src, start);
			else {
				const end = src.indexOf('"', start);
				value = end < 0 ? null : src.slice(start, end);
			}
			if (!value?.startsWith("/") || value.startsWith("//")) continue;
			out.push({ file: relative(ROOT, f), target: value });
		}
	}
	return out;
}

function checkTarget(target: string): string | null {
	const [beforeHash, hash] = target.split("#");
	const [path = "", query = ""] = (beforeHash ?? "").split("?");
	// Pfad beginnt dynamisch (`/${slug}`): nicht statisch prüfbar.
	if (/^\/X/.test(path)) return null;
	const route = findRoute(path === "" ? "/" : path);
	if (!route) return `kein Route-Ziel für ${path}`;
	const tab = new URLSearchParams(query).get("tab");
	if (tab && tab !== "X" && route.file) {
		const values = tabValues(route.file);
		if (values.size === 0) return `${path} liest keinen ?tab=`;
		if (!values.has(tab)) return `${path} kennt ?tab=${tab} nicht`;
	}
	if (hash && hash !== "X" && route.file) {
		const pageSrc = readFileSync(route.file, "utf8");
		if (!pageSrc.includes(`id="${hash}"`))
			return `${path} hat keinen Anker #${hash}`;
	}
	return null;
}

describe("Links", () => {
	it("findet die wichtigsten Routen im Inventar", () => {
		for (const p of [
			"/heute",
			"/controls/CC-GOV-01",
			"/dokumente/POL-001",
			"/api/nachweise/abc",
			"/impressum",
			"/robots.txt",
		])
			expect(findRoute(p), p).toBeDefined();
		expect(findRoute("/gibt-es-nicht/tief")).toBeUndefined();
	});

	it("erkennt tote Ziele, unbekannte Reiter und fehlende Anker", () => {
		expect(checkTarget("/kalender?tab=legal")).toMatch(/tab=legal/);
		expect(checkTarget("/controls?q=X")).toBeNull();
		expect(checkTarget("/sicherheit/auftraege")).toMatch(/kein Route-Ziel/);
		expect(checkTarget("/controls/X#nachweise")).toBeNull();
		expect(checkTarget("/controls/X#gibtsnicht")).toMatch(/Anker/);
		expect(checkTarget("/kalender?tab=rechtsaenderungen")).toBeNull();
	});

	it("jedes statische Link-Ziel führt auf eine Route und einen bekannten Reiter", () => {
		const targets = staticTargets();
		expect(targets.length).toBeGreaterThan(300);
		const problems = targets
			.map((t) => ({ ...t, problem: checkTarget(t.target) }))
			.filter((t) => t.problem)
			.map((t) => `${t.file}: ${t.target} — ${t.problem}`);
		expect(problems).toEqual([]);
	});

	it("jede Entitätsart verlinkt auf eine existierende Seite", () => {
		const id = "00000000-0000-4000-8000-000000000000";
		const refs: Record<string, string> = {
			control: "CC-GOV-01 Governance",
			document: "POL-001 Richtlinie",
			process: "P-01 Prozess",
		};
		const problems: string[] = [];
		for (const kind of ENTITY_KINDS) {
			for (const ref of [undefined, refs[kind]]) {
				const href = entityHref(kind, id, ref);
				const problem = checkTarget(href.replaceAll(id, "X"));
				if (problem) problems.push(`${kind}: ${href} — ${problem}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it("entityHref baut nie Pfade aus Fallback-Titeln", () => {
		expect(entityHref("document", "x", "document")).toBe("/dokumente");
		expect(entityHref("control", "x", "Control ohne Code")).toBe("/controls");
		expect(entityHref("control", "x", "CC-GOV-01 Titel")).toBe(
			"/controls/CC-GOV-01",
		);
	});

	it("lib/routes.ts kennt alle App- und Auth-Segmente", () => {
		const dirs = (group: string) =>
			readdirSync(join(ROOT, "app", group)).filter((n) =>
				statSync(join(ROOT, "app", group, n)).isDirectory(),
			);
		expect([...APP_SEGMENTS].sort()).toEqual(dirs("(app)").sort());
		expect([...AUTH_SEGMENTS].sort()).toEqual(dirs("(auth)").sort());
	});

	it("robots.txt sperrt die App, nicht die Rechtstexte", () => {
		const rules = robots().rules;
		const list = (Array.isArray(rules) ? rules : [rules]).flatMap((r) =>
			Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
		);
		const blocked = (p: string) =>
			list.some((r) =>
				r.endsWith("$") ? p === r.slice(0, -1) : p.startsWith(r),
			);
		for (const p of ["/heute", "/heute/aufgaben", "/datenschutz", "/admin"])
			expect(blocked(p), p).toBe(true);
		for (const p of [
			"/",
			"/datenschutz-erklaerung",
			"/impressum",
			"/preise",
			"/vertrauen",
		])
			expect(blocked(p), p).toBe(false);
	});
});
