// JavaScript-Budget je Seite (Leistung bei wachsender App): liest nach
// `pnpm build` die Chunks jeder Route aus .next/diagnostics und rechnet sie
// gepackt (gzip, wie nginx ausliefert). Bricht ab, wenn eine Seite über
// ihrer Grenze liegt — neue Funktionen dürfen das Laden nicht still
// aufblähen. Läuft im CI-Job e2e nach dem Build.
//
//   pnpm exec tsx scripts/check-bundle-budget.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const KB = 1024;

// Rahmen der App (Seiten ohne eigene Client-Bausteine): React, Next,
// Seitenleiste, Kopf, Dialog-Grundlage
const SHELL_BUDGET = 245 * KB;
// jede Seite
const PAGE_BUDGET = 320 * KB;
// begründete Ausnahmen
const EXCEPTIONS: Record<string, { budget: number; reason: string }> = {
	"/einstellungen": {
		budget: 370 * KB,
		reason: "alle Bereiche der Einstellungen auf einer Seite",
	},
};

type RouteStats = { route: string; firstLoadChunkPaths: string[] };

const stats = JSON.parse(
	readFileSync(join(root, ".next/diagnostics/route-bundle-stats.json"), "utf8"),
) as RouteStats[];

const chunkSize = new Map<string, number>();
const gz = (path: string) => {
	let n = chunkSize.get(path);
	if (n === undefined) {
		n = gzipSync(readFileSync(join(root, path))).length;
		chunkSize.set(path, n);
	}
	return n;
};

const rows = stats
	.map((r) => ({
		route: r.route,
		bytes: r.firstLoadChunkPaths
			.filter((p) => p.endsWith(".js"))
			.reduce((s, p) => s + gz(p), 0),
	}))
	.sort((a, b) => b.bytes - a.bytes);

const failures: string[] = [];
for (const r of rows) {
	const limit = EXCEPTIONS[r.route]?.budget ?? PAGE_BUDGET;
	if (r.bytes > limit)
		failures.push(
			`${r.route}: ${Math.round(r.bytes / KB)} KB > ${Math.round(limit / KB)} KB`,
		);
}
const app = rows.filter(
	(r) => r.route === "/suche" || r.route === "/aktivitaet",
);
for (const r of app)
	if (r.bytes > SHELL_BUDGET)
		failures.push(
			`Rahmen (${r.route}): ${Math.round(r.bytes / KB)} KB > ${Math.round(SHELL_BUDGET / KB)} KB`,
		);

for (const r of rows.slice(0, 10))
	console.log(`${String(Math.round(r.bytes / KB)).padStart(5)} KB  ${r.route}`);
if (failures.length) {
	console.error(
		`\nJavaScript-Budget überschritten (gzip):\n  ${failures.join("\n  ")}\n` +
			"Große Bausteine nachladen (next/dynamic, import() im Klick) oder Server-Code aus dem Browser halten.",
	);
	process.exit(1);
}
console.log(`\nBudget eingehalten (${rows.length} Seiten).`);
