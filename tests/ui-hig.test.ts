import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn, TEXT_STYLES } from "@/lib/utils";
import { ROOT, walkFiles } from "./helpers/walk";

// Bausteine nach Apple HIG (docs/design/hig.md): keine Versalien, keine
// Sperrung, keine Maison-Klassen, keine Schrift unter 11 px (Caption 2),
// Tippflächen aus --control-h (44 px am Touch-Bildschirm).
function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? walk(join(dir, e.name))
			: e.name.endsWith(".tsx")
				? [join(dir, e.name)]
				: [],
	);
}

const UI = walk("components/ui");
const FRAMES = [
	"components/page-header.tsx",
	"components/entity/empty-state.tsx",
	"components/entity/entity-layout.tsx",
	"components/entity/register-page.tsx",
	"components/entity/url-tabs.tsx",
];

const BANNED: [string, RegExp][] = [
	["Versalien", /\buppercase\b/],
	["Sperrung", /tracking-(\[0\.[1-9]|widest|wider)/],
	[
		"Maison-Klasse",
		/\b(lv-eyebrow|lv-nav|font-serif-display|text-brown|bg-brown)\b/,
	],
	["Maison-Schriftgröße", /text-\[0\.7(6)?rem\]/],
];

// Feste Größen in rem/px: nie unter 11 px (Caption 2)
function tooSmall(src: string): string[] {
	return [...src.matchAll(/text-\[(\d*\.?\d+)(rem|px)\]/g)]
		.filter(([, n, unit]) => Number(n) * (unit === "rem" ? 16 : 1) < 11)
		.map(([m]) => m);
}

describe("Bausteine nach HIG", () => {
	it.each([...UI, ...FRAMES])("%s", (file) => {
		const src = readFileSync(file, "utf8");
		const hits = BANNED.filter(([, re]) => re.test(src)).map(([name]) => name);
		expect(hits).toEqual([]);
		expect(tooSmall(src)).toEqual([]);
	});

	it("Buttons nehmen ihre Höhe aus --control-h", () => {
		expect(buttonVariants()).toContain("h-(--control-h)");
		expect(buttonVariants({ size: "sm" })).toContain("h-(--control-h-sm)");
		expect(buttonVariants({ size: "icon" })).toContain("size-(--control-h)");
	});

	it("Tippflächen am Touch-Bildschirm sind 44 px", () => {
		const tokens = readFileSync("styles/tokens.css", "utf8");
		const coarse = tokens.match(/@media \(pointer: coarse\) \{[^}]*\}/)?.[0];
		expect(coarse).toContain("--control-h: 2.75rem");
		expect(coarse).toContain("--control-h-sm: 2.75rem");
	});

	it("cn kennt die Textstile als Schriftgrößen (nicht als Farben)", () => {
		expect(cn("text-white", "text-subhead")).toBe("text-white text-subhead");
		expect(cn("text-footnote", "text-body")).toBe("text-body");
		for (const style of TEXT_STYLES) {
			expect(cn("text-foreground", `text-${style}`)).toContain(
				"text-foreground",
			);
		}
	});

	it("jeder Textstil ist in tokens.css definiert", () => {
		const tokens = readFileSync("styles/tokens.css", "utf8");
		for (const style of TEXT_STYLES) {
			expect(tokens).toContain(`--text-${style}:`);
			expect(tokens).toContain(`--text-${style}--line-height:`);
		}
	});
});

// Seiten und Komponenten beider Apps (Durchsicht 25.10.2026): was in der
// Durchsicht entfernt wurde, soll nicht zurückkommen.
const APP_FILES = walkFiles(
	["app", "components", "apps/wallet/app", "apps/wallet/components"],
	/\.tsx$/,
);
const CSS_MODULES = walkFiles(
	["app", "components", "apps/wallet/app", "apps/wallet/components"],
	/\.module\.css$/,
);

const APP_BANNED: [string, RegExp][] = [
	["Versalien", /\buppercase\b/],
	["Sperrung", /tracking-(\[0\.[1-9]|widest|wider)/],
	["Serifen", /\bfont-serif\b/],
	// Textstile statt Tailwind-Größen (große Display-Titel der Websites ab 4xl bleiben)
	["Tailwind-Schriftgröße", /\btext-(base|lg|xl|2xl|3xl)\b/],
	["feste px-Schrift", /\btext-\[\d+px\]/],
	// eingerückte Trennlinien (.list-inset) statt volle Breite
	[
		"Liste mit divide-y",
		/className="[^"]*\bdivide-y\b[^"]*\bbg-card\b|className="[^"]*\bbg-card\b[^"]*\bdivide-y\b/,
	],
	// Rückfrage als Alert/useConfirm (components/ui/confirm-alert.tsx)
	["window.confirm/alert", /\bwindow\.(confirm|alert)\(/],
	// Felder bleiben 44 px am Touch-Bildschirm (--control-h)
	["Feld mit h-8", /<(Input|Textarea|SelectTrigger)\b[^>]*\b(min-)?h-8\b/],
	// Ladetexte als Satz („Wird gespeichert …“), nicht Verb + Auslassung
	["Ladetext mit Auslassung", /\$\{t[A-Za-z]*\("[^"]+"\)\}…/],
];

describe("Seiten und Komponenten nach HIG", () => {
	it("keine verbotenen Muster", () => {
		const hits = APP_FILES.flatMap((f) => {
			const src = readFileSync(join(ROOT, f), "utf8");
			return [
				...APP_BANNED.filter(([, re]) => re.test(src)).map(
					([name]) => `${f}: ${name}`,
				),
				...tooSmall(src).map((m) => `${f}: ${m}`),
			];
		});
		expect(hits).toEqual([]);
	});

	it("CSS-Module: keine Schrift unter 11 px, keine Versalien, keine px-Schriftgrößen", () => {
		const hits = CSS_MODULES.flatMap((f) => {
			const src = readFileSync(join(ROOT, f), "utf8");
			const out: string[] = [];
			if (/text-transform:\s*uppercase/.test(src)) out.push(`${f}: Versalien`);
			for (const [, n, unit] of src.matchAll(
				/font-size:\s*(\d*\.?\d+)(px|rem)/g,
			)) {
				if (unit === "px") out.push(`${f}: font-size ${n}px`);
				else if (Number(n) * 16 < 11) out.push(`${f}: font-size ${n}rem`);
			}
			return out;
		});
		expect(hits).toEqual([]);
	});
});
