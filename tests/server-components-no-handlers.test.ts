import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Server Components können keine Funktionen an Client Components geben.
// Ein `onClick={…}` an <Link> in einer page.tsx ohne "use client" fällt
// erst zur Laufzeit auf — und nur, wenn die Zeile gerendert wird (z. B.
// sobald ein Nachweis Controls hat): „Event handlers cannot be passed to
// Client Component props“ → Fehlerseite. Dieser Test findet das vorab.

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name.startsWith(".")) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (
			/^(page|layout|template|default|not-found|loading)\.tsx$/.test(name)
		)
			out.push(p);
	}
	return out;
}

const root = join(__dirname, "..");
const serverFiles = walk(join(root, "app")).filter(
	(f) => !/^\s*["']use client["']/.test(readFileSync(f, "utf8")),
);

describe("Server Components (app/**/page|layout.tsx)", () => {
	it("gibt es", () => {
		expect(serverFiles.length).toBeGreaterThan(40);
	});

	it.each(
		serverFiles.map((f) => [f.replace(`${root}/`, "")]),
	)("%s übergibt keine Event-Handler", (rel) => {
		const src = readFileSync(join(root, rel), "utf8");
		const hits: string[] = [];
		for (const [i, line] of src.split("\n").entries()) {
			if (
				/\son(Click|Change|Submit|Select|Open|Close|Pointer\w*|Key\w*|Focus|Blur|Input|Toggle|ValueChange|CheckedChange|OpenChange)=\{/.test(
					line,
				)
			)
				hits.push(`${i + 1}: ${line.trim()}`);
		}
		expect(hits, `Event-Handler in Server Component ${rel}`).toEqual([]);
	});
});
