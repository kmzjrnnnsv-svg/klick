import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Eine "use client"-Datei darf die Datenbank nicht erreichen — auch nicht
// über Umwege (Komponente → lib/… → @/db). Turbopack meldet das im Dev-Server
// nur als 500 mit „ENOENT … build-manifest.json“, nicht als Fehler mit Ursache.
// Server Actions ("use server") sind eine Grenze: der Client bekommt nur
// eine Referenz, nicht den Code.

const root = join(__dirname, "..");
// Datenbank-Client (@/db) und alles unter lib/db; Schema-Konstanten sind erlaubt
const FORBIDDEN = /^(db\/index\.ts$|lib\/db\/)/;

function walk(dir: string, out: string[] = []): string[] {
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

// Laufzeit-Importe (ohne `import type`, inkl. Re-Exporte)
function imports(src: string): string[] {
	const out: string[] = [];
	const re =
		/(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) if (m[1]) out.push(m[1]);
	return out;
}

const isDirective = (src: string, d: "client" | "server") =>
	new RegExp(`^\\s*["']use ${d}["'];?`).test(src);

function pathToDb(entry: string): string[] | null {
	const seen = new Set<string>([entry]);
	const queue: string[][] = [[entry]];
	while (queue.length) {
		const chain = queue.shift() as string[];
		const file = chain[chain.length - 1] as string;
		const src = readFileSync(file, "utf8");
		if (file !== entry && isDirective(src, "server")) continue;
		for (const spec of imports(src)) {
			const target = resolve(file, spec);
			if (!target || seen.has(target)) continue;
			seen.add(target);
			const next = [...chain, target];
			if (FORBIDDEN.test(relative(root, target))) return next;
			queue.push(next);
		}
	}
	return null;
}

const clientFiles = ["app", "components", "lib"]
	.flatMap((d) => walk(join(root, d)))
	.filter((f) => isDirective(readFileSync(f, "utf8"), "client"));

describe("Client-Grenze", () => {
	it("findet Client-Komponenten", () => {
		expect(clientFiles.length).toBeGreaterThan(20);
	});

	it.each(
		clientFiles.map((f) => [relative(root, f)]),
	)("%s erreicht die Datenbank nicht", (rel) => {
		const chain = pathToDb(join(root, rel));
		expect(chain?.map((f) => relative(root, f)).join(" → ") ?? null).toBe(null);
	});
});
