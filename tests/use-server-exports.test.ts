import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Next.js: Eine "use server"-Datei darf nur async Funktionen exportieren.
// Ein `export const schema = z.object(…)` bricht zur Laufzeit das gesamte
// Action-Modul der Seite ("A \"use server\" file can only export async
// functions, found object") — jede Action der Seite liefert dann 500.
// Der Build fängt das nicht; dieser Test tut es.

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(ts|tsx)$/.test(name)) out.push(p);
	}
	return out;
}

const root = join(__dirname, "..");
const files = ["app", "lib", "components"]
	.flatMap((d) => walk(join(root, d)))
	.filter((f) => /^\s*["']use server["'];?/.test(readFileSync(f, "utf8")));

describe("use server-Dateien", () => {
	it("gibt es (Server Actions)", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it.each(
		files.map((f) => [f.replace(`${root}/`, "")]),
	)("%s exportiert nur async Funktionen", (rel) => {
		const src = readFileSync(join(root, rel), "utf8");
		const bad: string[] = [];
		const lines = src.split("\n");
		for (const [i, line] of lines.entries()) {
			// Typen sind zur Laufzeit weg und erlaubt.
			if (/^export (type|interface) /.test(line)) continue;
			if (/^export async function /.test(line)) continue;
			if (/^export default async function /.test(line)) continue;
			// Sicherheitsnetz: `export const x = safeAction("x", xImpl)` liefert
			// eine async Funktion (lib/actions/safe.ts), ggf. über mehrere Zeilen.
			if (/^export const [A-Za-z0-9_]+ = safeAction\($/.test(line)) continue;
			if (/^export const [A-Za-z0-9_]+ = safeAction\(/.test(line)) continue;
			if (/^export /.test(line)) bad.push(`${i + 1}: ${line.trim()}`);
		}
		expect(bad, `Unzulässige Exporte in ${rel}`).toEqual([]);
	});

	it.each(
		files.map((f) => [f.replace(`${root}/`, "")]),
	)("%s: jede Action ist mit safeAction umhüllt", (rel) => {
		const src = readFileSync(join(root, rel), "utf8");
		const exported = [
			...src.matchAll(/^export async function ([A-Za-z0-9_]+)/gm),
		].map((m) => m[1]);
		expect(
			exported,
			`Direkt exportierte Actions in ${rel} — bitte safeAction verwenden`,
		).toEqual([]);
	});
});
