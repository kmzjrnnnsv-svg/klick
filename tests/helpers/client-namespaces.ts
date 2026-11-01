// Welche Text-Namespaces brauchen die Client-Komponenten, die eine Datei
// (Seite, Layout, Fehlerseite) rendert? Folgt den Importen wie der Test
// `client-boundary`: ab einer "use client"-Datei ist alles Darunter
// Browser-Code; "use server"-Dateien sind eine Grenze (nur Referenzen).
// Gesammelt werden `useTranslations("Ns…")` aus Browser-Code. Genutzt vom
// Test `client-messages`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const root = join(import.meta.dirname, "..", "..");

export function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.tsx?$/.test(name)) out.push(p);
	}
	return out;
}

function resolve(from: string, spec: string): string | null {
	const base = spec.startsWith("@/")
		? join(root, spec.slice(2))
		: spec.startsWith(".")
			? join(dirname(from), spec)
			: null;
	if (!base) return null;
	for (const c of [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
	])
		if (existsSync(c) && statSync(c).isFile()) return c;
	return null;
}

// Laufzeit-Importe: statisch (ohne `import type`), Re-Exporte, nur Wirkung
// und dynamisch (`import("…")`, auch in next/dynamic)
function imports(src: string): string[] {
	const out: string[] = [];
	const re =
		/(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) if (m[1]) out.push(m[1]);
	for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g))
		if (m[1]) out.push(m[1]);
	return out;
}

const isDirective = (src: string, d: "client" | "server") =>
	new RegExp(
		`^(?:\\s*//[^\\n]*\\n|\\s*/\\*[\\s\\S]*?\\*/)*\\s*["']use ${d}["'];?`,
	).test(src);

const cache = new Map<string, string>();
const read = (f: string) => {
	let s = cache.get(f);
	if (s === undefined) {
		s = readFileSync(f, "utf8");
		cache.set(f, s);
	}
	return s;
};

export type Needs = {
	namespaces: Set<string>;
	/** Stellen, die sich nicht statisch auswerten lassen */
	problems: string[];
};

export function clientNamespaces(entry: string): Needs {
	const namespaces = new Set<string>();
	const problems: string[] = [];
	const seen = new Set<string>();
	const queue: [string, boolean][] = [[entry, false]];
	while (queue.length) {
		const [file, client] = queue.shift() as [string, boolean];
		const src = read(file);
		if (file !== entry && isDirective(src, "server")) continue;
		const inClient = client || isDirective(src, "client");
		const key = `${inClient ? "c" : "s"}:${file}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (inClient) {
			for (const m of src.matchAll(/\buseTranslations\(([^)]*)\)/g)) {
				const lit = (m[1] ?? "")
					.trim()
					.match(/^["']([A-Za-z0-9_]+)(?:\.[^"']*)?["']$/);
				if (lit?.[1]) namespaces.add(lit[1]);
				else
					problems.push(
						`${relative(root, file)}: useTranslations(${m[1]}) ohne festen Namespace`,
					);
			}
			if (/\buseMessages\(/.test(src))
				problems.push(
					`${relative(root, file)}: useMessages() liest alle Texte`,
				);
		}
		for (const spec of imports(src)) {
			const target = resolve(file, spec);
			if (target) queue.push([target, inClient]);
		}
	}
	return { namespaces, problems };
}

/** Namespaces, die eine Seite über `withMessages(…, [ … ])` anfordert */
export function declaredNamespaces(src: string): string[] | null {
	const m = src.match(/withMessages\(\s*\w+\s*,\s*\[([^\]]*)\]/);
	if (!m) return null;
	return [...(m[1] ?? "").matchAll(/["']([A-Za-z0-9_]+)["']/g)].map(
		(x) => x[1] as string,
	);
}
