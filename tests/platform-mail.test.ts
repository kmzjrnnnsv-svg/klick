import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_MAIL } from "@/lib/mail/address";

// Die Plattform hat genau eine Mailadresse (lib/mail/address.ts) — Absender,
// security.txt und Doku nennen nur sie. Eine zweite @raza.work-Adresse wäre
// ein Postfach, das es nicht gibt.
const ROOT = process.cwd();
const DIRS = [
	"app",
	"lib",
	"components",
	"messages",
	"public",
	"deploy",
	"docs",
];
const FILES = ["README.md", "SECURITY.md", ".env.example", "CLAUDE.md"];
const TEXT = /\.(tsx?|mjs|json|md|txt|ya?ml|conf|service|sh|example)$/;

function walk(dir: string, out: string[]) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (TEXT.test(name)) out.push(p);
	}
}

describe("Plattform-Mailadresse", () => {
	it(`nur ${PLATFORM_MAIL} unter @raza.work`, () => {
		const files = FILES.map((f) => join(ROOT, f));
		for (const d of DIRS) walk(join(ROOT, d), files);
		const others: string[] = [];
		for (const f of files) {
			const text = readFileSync(f, "utf8");
			for (const m of text.matchAll(/[\w.+-]+@raza\.work\b/gi))
				if (m[0].toLowerCase() !== PLATFORM_MAIL)
					others.push(`${f.slice(ROOT.length + 1)}: ${m[0]}`);
		}
		expect(others).toEqual([]);
	});

	it("security.txt nennt die Plattform-Adresse", () => {
		const txt = readFileSync(
			join(ROOT, "public/.well-known/security.txt"),
			"utf8",
		);
		expect(txt).toContain(`Contact: mailto:${PLATFORM_MAIL}`);
	});
});
