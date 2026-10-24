import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Quelltext-Lauf für Grenztests über beide Apps (Klick an der Wurzel,
// both.money unter apps/wallet). Pfade sind relativ zur Repo-Wurzel.

export const ROOT = resolve(import.meta.dirname, "../..");
export const WALLET_APP = "apps/wallet";

const SKIP = new Set(["node_modules", ".next", "dist", "migrations"]);

export function walkFiles(
	dirs: readonly string[],
	ext: RegExp = /\.(ts|tsx)$/,
): string[] {
	const out: string[] = [];
	const visit = (abs: string) => {
		for (const name of readdirSync(abs)) {
			if (SKIP.has(name)) continue;
			const p = join(abs, name);
			if (statSync(p).isDirectory()) visit(p);
			else if (ext.test(name)) out.push(relative(ROOT, p));
		}
	};
	for (const d of dirs) {
		const abs = join(ROOT, d);
		if (existsSync(abs)) visit(abs);
	}
	return out.sort();
}

// Statische, Seiteneffekt- und dynamische Import-Spezifizierer einer Datei
export function importsOf(file: string): string[] {
	const src = readFileSync(join(ROOT, file), "utf8");
	const out = [
		...src.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"\n]+)"/gms),
		...src.matchAll(/^import\s+"([^"\n]+)"/gm),
		...src.matchAll(/\bimport\(\s*"([^"\n]+)"\s*\)/g),
	].map((m) => m[1] as string);
	return [...new Set(out)];
}

// Spezifizierer → Repo-relativer Pfad (ohne Endung) oder Paketname
export function resolveSpec(file: string, spec: string): string {
	if (spec.startsWith("@/")) return spec.slice(2);
	if (spec.startsWith("@wallet/")) return `${WALLET_APP}/${spec.slice(8)}`;
	if (spec.startsWith(".")) {
		const dir = file.split("/").slice(0, -1).join("/");
		return relative(ROOT, resolve(ROOT, dir, spec));
	}
	return `pkg:${spec}`;
}
