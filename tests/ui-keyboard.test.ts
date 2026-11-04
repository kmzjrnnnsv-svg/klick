import { describe, expect, it } from "vitest";
import {
	isApplePlatform,
	isFindShortcut,
	moveIndex,
} from "@/components/ui/keyboard";
import { foldText, matchesWords, searchWords } from "@/lib/text/search";

const key = (k: string, mods: Partial<Record<string, boolean>> = {}) => ({
	key: k,
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	...mods,
});

describe("⌘F / Strg+F", () => {
	it("am Mac nur ⌘F, Strg+F bleibt dem System", () => {
		expect(isFindShortcut(key("f", { metaKey: true }), true)).toBe(true);
		expect(isFindShortcut(key("F", { metaKey: true }), true)).toBe(true);
		expect(isFindShortcut(key("f", { ctrlKey: true }), true)).toBe(false);
	});
	it("sonst Strg+F, nicht Windows-Taste+F", () => {
		expect(isFindShortcut(key("f", { ctrlKey: true }), false)).toBe(true);
		expect(isFindShortcut(key("f", { metaKey: true }), false)).toBe(false);
	});
	it("mit Umschalt oder Wahltaste nicht (⇧⌘F, ⌥⌘F gehören anderen)", () => {
		expect(
			isFindShortcut(key("f", { metaKey: true, shiftKey: true }), true),
		).toBe(false);
		expect(
			isFindShortcut(key("f", { ctrlKey: true, altKey: true }), false),
		).toBe(false);
		expect(isFindShortcut(key("g", { metaKey: true }), true)).toBe(false);
	});
	it("Plattform aus dem Browser", () => {
		expect(isApplePlatform("MacIntel")).toBe(true);
		expect(isApplePlatform("macOS")).toBe(true);
		expect(isApplePlatform("iPad")).toBe(true);
		expect(isApplePlatform("Win32")).toBe(false);
		expect(isApplePlatform("Linux x86_64")).toBe(false);
	});
});

describe("↑/↓ in Listen", () => {
	it("aus dem Suchfeld zum ersten Eintrag, vom ersten zurück", () => {
		expect(moveIndex(-1, 5, "ArrowDown")).toBe(0);
		expect(moveIndex(0, 5, "ArrowUp")).toBe(-1);
		expect(moveIndex(-1, 5, "ArrowUp")).toBe(-1);
	});
	it("wandert und bleibt am Ende stehen", () => {
		expect(moveIndex(1, 5, "ArrowDown")).toBe(2);
		expect(moveIndex(4, 5, "ArrowDown")).toBe(4);
		expect(moveIndex(3, 5, "ArrowUp")).toBe(2);
	});
	it("Pos1/Ende nur in der Liste, nicht im Suchfeld", () => {
		expect(moveIndex(2, 5, "Home")).toBe(0);
		expect(moveIndex(2, 5, "End")).toBe(4);
		expect(moveIndex(-1, 5, "Home")).toBeNull();
		expect(moveIndex(-1, 5, "End")).toBeNull();
	});
	it("andere Tasten und leere Listen gehören nicht dazu", () => {
		expect(moveIndex(1, 5, "Enter")).toBeNull();
		expect(moveIndex(1, 5, "ArrowRight")).toBeNull();
		expect(moveIndex(-1, 0, "ArrowDown")).toBeNull();
	});
});

describe("Suche in kurzen Listen", () => {
	it("Umlaute, ß und Großschreibung egal", () => {
		expect(foldText("Schlüssel Größe")).toBe("schlussel grosse");
		expect(matchesWords(searchWords("SCHLUSSEL"), "Schlüssel")).toBe(true);
		expect(matchesWords(searchWords("grosse"), "Größe")).toBe(true);
	});
	it("jedes Wort muss vorkommen, Leerzeichen zählen nicht", () => {
		const text = "Freigaben und Freigabe-Designer";
		expect(matchesWords(searchWords("freigabe designer"), text)).toBe(true);
		expect(matchesWords(searchWords("freigabe passkey"), text)).toBe(false);
		expect(searchWords("   ")).toEqual([]);
	});
});
