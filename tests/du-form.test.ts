import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Konvention: Du-Form überall (CLAUDE.md). Fängt förmliche Anrede in UI-Texten
// und Katalog-Strings (Prüffragen, Empfehlungen). „Sie“ am Satzanfang bleibt
// erlaubt — dort ist es meist 3. Person („Die Leitung … Sie stellt sicher“).
const FORMAL = [/\b(Ihnen|Ihre[nmrs]?|Ihr)\b/, /[a-zäöüß] Sie\b/];

function strings(file: string): string[] {
	const src = readFileSync(file, "utf8");
	return [...src.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

const files = [
	"messages/de.json",
	...readdirSync("lib/compliance/catalog")
		.filter((f) => f.endsWith(".ts"))
		.map((f) => join("lib/compliance/catalog", f)),
];

describe("Du-Form", () => {
	it.each(files)("%s enthält keine förmliche Anrede", (file) => {
		const hits = strings(file).filter((s) => FORMAL.some((re) => re.test(s)));
		expect(hits).toEqual([]);
	});
});
