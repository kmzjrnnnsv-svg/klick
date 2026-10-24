import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn, TEXT_STYLES } from "@/lib/utils";

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
