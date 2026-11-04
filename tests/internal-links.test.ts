import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Statischer Abgleich interner Links (Systemtest 03.11.): Ein Link mit
// `?tab=<wert>` braucht den Wert als Text auf der Zielseite (Reiter), ein Link
// mit `#anker` eine passende `id` auf der Zielseite oder in einer Komponente,
// die sie direkt einbindet. Sonst landet man auf dem Standard-Reiter bzw.
// oben auf der Seite. Pfade mit `${…}` gelten als dynamisches Segment.

const ROOT = process.cwd();
const APP = join(ROOT, "app");

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(tsx?)$/.test(name)) out.push(p);
	}
	return out;
}

const SOURCES = [
	...walk(APP),
	...walk(join(ROOT, "components")),
	...walk(join(ROOT, "lib")),
];

type Page = { file: string; segments: string[]; dynamic: number };

const PAGES: Page[] = walk(APP)
	.filter((f) => f.endsWith("/page.tsx"))
	.map((file) => {
		const segments = relative(APP, file)
			.replace(/\/?page\.tsx$/, "")
			.split("/")
			.filter((s) => s && !/^\(.*\)$/.test(s));
		return {
			file,
			segments,
			dynamic: segments.filter((s) => s.startsWith("[")).length,
		};
	})
	// feste Segmente vor dynamischen (/funktionen vor /[slug])
	.sort((a, b) => a.dynamic - b.dynamic);

function pageFor(path: string): Page | undefined {
	const parts = path.split("/").filter(Boolean);
	return PAGES.find(
		(p) =>
			p.segments.length === parts.length &&
			p.segments.every(
				(s, i) => s.startsWith("[") || (s === parts[i] && parts[i] !== "_"),
			),
	);
}

function directImports(file: string): string[] {
	const src = readFileSync(file, "utf8");
	const out: string[] = [];
	for (const m of src.matchAll(/from "@\/(components|lib)\/([^"]+)"/g))
		for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
			const p = join(ROOT, m[1] ?? "", `${m[2]}${ext}`);
			if (existsSync(p)) {
				out.push(p);
				break;
			}
		}
	return out;
}

// Pfad aus dem Quelltext: `${…}` wird zu einem Platzhalter-Segment „_“
const PATH = String.raw`(\/(?:\$\{[^}]+\}|[a-z0-9\-/])+)`;
const norm = (p: string) => p.replace(/\$\{[^}]+\}/g, "_");

type Link = { from: string; path: string; value: string };

function collect(re: RegExp): Link[] {
	const out: Link[] = [];
	for (const file of SOURCES) {
		const src = readFileSync(file, "utf8");
		for (const m of src.matchAll(re))
			out.push({
				from: relative(ROOT, file),
				path: norm(m[1] ?? ""),
				value: m[2] ?? "",
			});
	}
	return out;
}

describe("interne Links", () => {
	it("jeder ?tab=-Wert ist ein Reiter der Zielseite", () => {
		const links = collect(
			new RegExp(
				`["'\`]${PATH}\\?(?:[a-z]+=[^"'\`&#$]*&)*tab=([a-z0-9\\-_]+)`,
				"g",
			),
		);
		expect(links.length).toBeGreaterThan(50);
		const broken = links.flatMap((l) => {
			const page = pageFor(l.path);
			if (!page) return [];
			return readFileSync(page.file, "utf8").includes(`"${l.value}"`)
				? []
				: [`${l.from}: ${l.path}?tab=${l.value}`];
		});
		expect(broken).toEqual([]);
	});

	it("jeder #anker hat eine id auf der Zielseite", () => {
		const links = collect(
			new RegExp(
				`["'\`]${PATH}(?:\\?[^"'\`#]*)?#([a-z][a-z0-9\\-_]*)["'\`]`,
				"g",
			),
		);
		expect(links.length).toBeGreaterThan(5);
		const broken = links.flatMap((l) => {
			const page = pageFor(l.path);
			if (!page) return [];
			const text = [page.file, ...directImports(page.file)]
				.map((f) => readFileSync(f, "utf8"))
				.join("\n");
			return text.includes(`"${l.value}"`)
				? []
				: [`${l.from}: ${l.path}#${l.value}`];
		});
		expect(broken).toEqual([]);
	});
});
