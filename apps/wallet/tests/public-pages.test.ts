import * as landing from "@wallet/lib/landing";
import * as roadmap from "@wallet/lib/roadmap";
import { describe, expect, it } from "vitest";

// Öffentliche Seiten (Startseite abgemeldet, Fahrplan): Texte für
// Investor:innen und Entwickler:innen. Du-Form, keine Geviertstriche, keine
// Versprechen, die eine Zulassung behaupten, und keine internen Angaben.

function texts(v: unknown): string[] {
	if (typeof v === "string") return [v];
	if (Array.isArray(v)) return v.flatMap(texts);
	if (v && typeof v === "object") return Object.values(v).flatMap(texts);
	return [];
}

const all = [...texts(landing), ...texts(roadmap)];

describe("öffentliche Seiten", () => {
	it("haben Texte", () => {
		expect(all.length).toBeGreaterThan(100);
	});

	it("bleiben in der Du-Form", () => {
		const formal = [/\b(Ihnen|Ihre[nmrs]?|Ihr)\b/, /[a-zäöüß] Sie\b/];
		expect(all.filter((t) => formal.some((re) => re.test(t)))).toEqual([]);
	});

	it("nutzen keine Geviertstriche", () => {
		expect(all.filter((t) => t.includes("—"))).toEqual([]);
	});

	it("behaupten keine Zulassung oder Garantie", () => {
		const claims =
			/zertifiziert|lizenziert|BaFin-(reguliert|zugelassen)|garantiert|100\s?%\s?sicher/i;
		expect(all.filter((t) => claims.test(t))).toEqual([]);
	});

	it("verraten keine internen Angaben", () => {
		const internal = [
			/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, // IP-Adressen
			/wireguard|systemd|credstore|\.service\b|\.sock\b|rpcauth/i,
			/\b(localhost|127\.0\.0\.1)\b/,
			/:\d{4,5}\b/, // Ports
		];
		expect(all.filter((t) => internal.some((re) => re.test(t)))).toEqual([]);
	});

	it("nennen zu jedem Schritt die Pflicht, auf die er einzahlt", () => {
		for (const item of [...roadmap.TODAY, ...roadmap.NEXT, ...roadmap.PHASES]) {
			expect(item.anchors.length, item.key).toBeGreaterThan(0);
		}
	});

	it("sperren Kundengelder bis zur Erlaubnis", () => {
		const k = roadmap.PHASES.find((p) => p.key === "phase-k");
		expect(k?.status).toBe("locked");
		expect(k?.requires).toMatch(/Erlaubnis/);
	});

	it("haben eindeutige Schlüssel", () => {
		const keys = [...roadmap.TODAY, ...roadmap.NEXT, ...roadmap.PHASES].map(
			(i) => i.key,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
