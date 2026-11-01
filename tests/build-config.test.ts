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

// Release-Artefakte (ADR-034): CI baut, der Server holt nur das Ergebnis.
// Der Job darf nur nach grünen Tests laufen, nur auf main, mit der echten
// Adresse und ohne Geheimnisse.
describe("Release-Artefakte aus CI", () => {
	const ci = read(".github/workflows/ci.yml");
	const job = ci.slice(ci.indexOf("\n  release-build:"));

	it("nur auf main nach check, e2e und wallet-build, ohne Variablen übersprungen", () => {
		expect(job).toContain(
			"if: github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.KLICK_PUBLIC_URL != '' && vars.WALLET_PUBLIC_URL != ''",
		);
		expect(job).toContain("needs: [check, e2e, wallet-build]");
	});

	it("baut mit der Adresse aus den Repo-Variablen, nie mit Geheimnissen", () => {
		expect(job).toMatch(/BETTER_AUTH_URL: \$\{\{ vars\.KLICK_PUBLIC_URL \}\}/);
		expect(job).toMatch(/WALLET_AUTH_URL: \$\{\{ vars\.WALLET_PUBLIC_URL \}\}/);
		expect(job).not.toContain("secrets.");
		expect(job).toContain(
			"Repo-Variablen KLICK_PUBLIC_URL und WALLET_PUBLIC_URL fehlen",
		);
	});

	it("packt beide Apps und lädt sie ungezippt hoch", () => {
		expect(job).toContain(
			"node deploy/rollout/artefakt.mjs packen --app klick",
		);
		expect(job).toContain("node deploy/rollout/artefakt.mjs packen --app both");
		for (const app of ["klick", "both"])
			expect(job).toContain(`path: release/${app}-\${{ github.sha }}.tar.gz`);
		expect(job.match(/archive: false/g)).toHaveLength(2);
		expect(job).toMatch(/- name: Packen\n(?:\s+#.*\n)?\s+shell: bash/);
	});

	it("ohne Build vorbereiten: Wächter, Abhängigkeiten, Migrationen", () => {
		const pkg = JSON.parse(read("package.json")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts["release:prepare"]).not.toContain("next build");
		expect(pkg.scripts["release:prepare"]).toContain("pnpm db:migrate");
		expect(pkg.scripts["release:wallet:prepare"]).not.toContain("next build");
		expect(pkg.scripts["release:wallet:prepare"]).toContain(
			"pnpm db:wallet:migrate",
		);
	});
});
