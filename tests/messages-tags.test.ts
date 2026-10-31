import { describe, expect, it } from "vitest";
import wallet from "@/apps/wallet/messages/de.json";
import de from "@/messages/de.json";

// next-intl liest <name>…</name> als Rich-Text-Tag. Ein einzelnes „<wort>“
// (z. B. ein Platzhalter wie <EntityDescriptor …> oder <höhe>) bricht die
// Nachricht: die Seite zeigt dann den Schlüssel statt des Texts.

function strings(v: unknown, path: string, out: [string, string][]) {
	if (typeof v === "string") out.push([path, v]);
	else if (Array.isArray(v))
		for (const [i, x] of v.entries()) strings(x, `${path}[${i}]`, out);
	else if (v && typeof v === "object")
		for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
}

describe("Texte ohne ungepaarte Tags", () => {
	for (const [name, file] of [
		["Klick", de],
		["both.money", wallet],
	] as const) {
		it(name, () => {
			const all: [string, string][] = [];
			strings(file, name, all);
			const bad = all.filter(([, s]) => {
				const opens = [...s.matchAll(/<([^\s/<>]+)[^<>]*>/g)].map((m) => m[1]);
				return opens.some((tag) => !s.includes(`</${tag}>`));
			});
			expect(bad.map(([p]) => p)).toEqual([]);
		});
	}
});
