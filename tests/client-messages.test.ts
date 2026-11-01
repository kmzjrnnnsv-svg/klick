import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SHELL_NAMESPACES } from "@/lib/i18n/messages";
import de from "@/messages/de.json";
import {
	clientNamespaces,
	declaredNamespaces,
	root,
	walk,
} from "./helpers/client-namespaces";

// Texte im Browser nur, soweit die Seite sie braucht: Root-Layout gibt
// SHELL_NAMESPACES weiter, Seiten mit eigenen Client-Bausteinen fordern
// ihre Namespaces über withMessages(…, [ … ]) an. Fehlt einer, zeigt der
// Browser den Schlüssel statt des Texts — deshalb rechnet dieser Test die
// Liste aus den Importen nach und verlangt sie genau.

const files = walk(`${root}/app`);
const boundaries = files.filter((f) =>
	/\/(layout|error|not-found|global-error|loading|template)\.tsx$/.test(f),
);
const pages = files.filter((f) => /\/page\.tsx$/.test(f));
const shell = new Set<string>(SHELL_NAMESPACES);
const rel = (f: string) => relative(root, f);

describe("Texte je Seite", () => {
	it("Rahmen-Namespaces gibt es alle", () => {
		for (const ns of SHELL_NAMESPACES) expect(Object.keys(de)).toContain(ns);
	});

	it("Root-Layout gibt nur die Rahmen-Namespaces weiter", () => {
		const src = readFileSync(`${root}/app/layout.tsx`, "utf8");
		expect(src).toMatch(/pickMessages\(messages, SHELL_NAMESPACES\)/);
	});

	it.each(
		boundaries.map((f) => [rel(f)]),
	)("%s braucht nur Rahmen-Namespaces", (file) => {
		const needs = clientNamespaces(`${root}/${file}`);
		expect(needs.problems).toEqual([]);
		const missing = [...needs.namespaces].filter((n) => !shell.has(n));
		expect(
			missing,
			"in SHELL_NAMESPACES (lib/i18n/messages.ts) ergänzen",
		).toEqual([]);
	});

	it.each(
		pages.map((f) => [rel(f)]),
	)("%s fordert genau seine Texte an", (file) => {
		const src = readFileSync(`${root}/${file}`, "utf8");
		const needs = clientNamespaces(`${root}/${file}`);
		expect(needs.problems).toEqual([]);
		const need = [...needs.namespaces].sort();
		const declared = declaredNamespaces(src);
		if (declared === null) {
			// ohne eigenen Provider gilt der des Root-Layouts
			const missing = need.filter((n) => !shell.has(n));
			expect(
				missing,
				`export default withMessages(Page, [${need.map((n) => `"${n}"`).join(", ")}])`,
			).toEqual([]);
			return;
		}
		expect(
			[...declared].sort(),
			"Liste in withMessages(…) an die Client-Bausteine der Seite anpassen",
		).toEqual(need);
	});
});
