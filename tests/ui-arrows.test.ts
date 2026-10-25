import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, walkFiles } from "./helpers/walk";

// Pfeile nur, wo Apple sie zeigt (docs/design/hig.md, Abschnitt 6 „Pfeile
// und Chevrons“): Chevrons für Drill-down, Zurück, Aufklappen und Pop-up,
// Pfeil schräg oben für externe Links, fachliche Richtung nur an erlaubten
// Stellen. Keine Pfeile in sichtbaren Texten — Menüpfade mit „>“, Abläufe
// als Satz, Vorher/Nachher in Worten.

const CODE_DIRS = [
	"app",
	"components",
	"lib",
	"apps/wallet/app",
	"apps/wallet/components",
	"apps/wallet/lib",
];

// Umschrift für PDFs (→ wird „->“), kein UI-Text
const TEXT_EXEMPT = new Set(["lib/export/pdf-fonts.ts"]);

const GLYPHS = /[→←↑↓↗↘↙↖↔⇒⇐⇔➜➔➝↳↪]/u;
// „A -> B“ als Prosa; SQL `->>`/`->'` bleibt erlaubt
const ASCII_ARROW = / -> /;

function withoutComments(src: string): string {
	return src
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split("\n")
		.map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
		.join("\n");
}

function arrowLines(text: string): string[] {
	return text
		.split("\n")
		.filter((l) => GLYPHS.test(l) || ASCII_ARROW.test(l))
		.map((l) => l.trim());
}

// Lucide-Symbole mit Pfeil: erlaubt überall oder nur in bestimmten Dateien
const ARROW_ICON = /^(Arrow|Move|Corner|Chevrons|FastForward|ExternalLink)/;
const ICON_ANYWHERE = new Set(["ArrowUpRight", "ChevronsUpDown"]);
const ICON_FILES: Record<string, string[]> = {
	// Richtung einer Bewegung (Ein- und Ausgang), wie in Apple Wallet
	ArrowDownLeft: ["apps/wallet/components/wallet/transfer-list.tsx"],
	// Stufen umsortieren (Tastatur-Alternative zum Ziehen)
	ArrowUp: ["components/settings/workflows/workflow-editor.tsx"],
	ArrowDown: ["components/settings/workflows/workflow-editor.tsx"],
	// Wallet-Aktionen „Empfangen“ und „Umbuchen“
	ArrowDownToLine: [
		"apps/wallet/components/shell/nav-icon.tsx",
		"apps/wallet/components/wallet/home-overview.tsx",
		"apps/wallet/app/(welcome)/welcome/[step]/page.tsx",
	],
	ArrowLeftRight: ["apps/wallet/components/wallet/home-overview.tsx"],
};

function lucideImports(src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g,
	)) {
		for (const part of (m[1] ?? "").split(",")) {
			const name = part
				.trim()
				.split(/\s+as\s+/)[0]
				?.replace(/Icon$/, "");
			if (name) out.push(name);
		}
	}
	return out;
}

const codeFiles = walkFiles(CODE_DIRS, /\.(ts|tsx)$/);

describe("Pfeile nach den HIG", () => {
	it("sichtbare Texte enthalten keine Pfeile", () => {
		const hits: string[] = [];
		const textFiles = [
			...codeFiles.filter((f) => !TEXT_EXEMPT.has(f)),
			"messages/de.json",
			"apps/wallet/messages/de.json",
			// Platzhalter der Rechtstexte landen in der Datenbank
			"db/seed.ts",
			...walkFiles(["deploy/confirm"], /\.(js|html)$/),
		];
		for (const file of textFiles) {
			const src = readFileSync(join(ROOT, file), "utf8");
			const text = file.endsWith(".json") ? src : withoutComments(src);
			for (const line of arrowLines(text)) hits.push(`${file}: ${line}`);
		}
		expect(hits).toEqual([]);
	});

	it("CSS erzeugt keine Pfeile", () => {
		const hits: string[] = [];
		for (const file of walkFiles(
			["app", "components", "styles", "apps/wallet", "deploy/confirm"],
			/\.css$/,
		)) {
			const src = withoutComments(readFileSync(join(ROOT, file), "utf8"));
			for (const m of src.matchAll(/content:\s*"([^"]*)"/g))
				if (GLYPHS.test(m[1] ?? "")) hits.push(`${file}: ${m[0]}`);
		}
		expect(hits).toEqual([]);
	});

	it("Pfeil-Symbole nur, wo Apple sie zeigt", () => {
		const hits: string[] = [];
		for (const file of codeFiles) {
			const src = readFileSync(join(ROOT, file), "utf8");
			for (const name of lucideImports(src)) {
				if (!ARROW_ICON.test(name) || ICON_ANYWHERE.has(name)) continue;
				if (ICON_FILES[name]?.includes(file)) continue;
				hits.push(`${file}: ${name}`);
			}
		}
		expect(hits).toEqual([]);
	});
});
