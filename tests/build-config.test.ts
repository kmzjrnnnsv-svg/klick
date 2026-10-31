import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Typen prüft nicht `next build`, sondern `pnpm typecheck` in CI und
// preflight (next.config.ts: typescript.ignoreBuildErrors). Das geht nur,
// solange CI den Typ-Check wirklich ausführt und er genug Speicher hat;
// sonst liefe Code mit Typfehlern unbemerkt bis auf den Server.

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("Typ-Check außerhalb des Builds", () => {
	it("next build prüft keine Typen", () => {
		expect(read("next.config.ts")).toMatch(
			/typescript:\s*\{\s*ignoreBuildErrors:\s*true\s*\}/,
		);
	});

	it("CI und preflight führen pnpm typecheck aus", () => {
		const ci = read(".github/workflows/ci.yml");
		expect(ci).toMatch(/^\s*run: pnpm typecheck\s*$/m);
		const pkg = JSON.parse(read("package.json")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts.preflight).toMatch(/^pnpm typecheck && /);
	});

	it("typecheck prüft beide Apps mit genug Heap", () => {
		const pkg = JSON.parse(read("package.json")) as {
			scripts: Record<string, string>;
		};
		const runs = pkg.scripts.typecheck.split("&&").map((s) => s.trim());
		expect(runs).toHaveLength(2);
		for (const r of runs) {
			const heap = r.match(/--max-old-space-size=(\d+)/);
			expect(heap, r).not.toBeNull();
			expect(Number(heap?.[1])).toBeGreaterThanOrEqual(4096);
			expect(r).toContain("typescript/bin/tsc --noEmit");
		}
		expect(runs[1]).toContain("-p apps/wallet");
	});
});
