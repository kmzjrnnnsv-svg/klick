import * as landing from "@wallet/lib/landing";
import * as roadmap from "@wallet/lib/roadmap";
import * as trading from "@wallet/lib/trading";
import { describe, expect, it } from "vitest";

// Öffentliche Seiten (Startseite abgemeldet, Fahrplan, Bot): Texte für
// Investor:innen und Entwickler:innen. Du-Form, keine Geviertstriche, keine
// Versprechen, die eine Zulassung oder einen Gewinn behaupten, und keine
// internen Angaben. Die Startseite in kurzen Sätzen.

function texts(v: unknown): string[] {
	if (typeof v === "string") return [v];
	if (Array.isArray(v)) return v.flatMap(texts);
	if (v && typeof v === "object") return Object.values(v).flatMap(texts);
	return [];
}

const all = [...texts(landing), ...texts(roadmap), ...texts(trading)];

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

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
		for (const item of [
			...roadmap.STAGES,
			...roadmap.TODAY,
			...roadmap.NEXT,
			...roadmap.PHASES,
			...trading.TRADING_STEPS,
		]) {
			expect(item.anchors.length, item.key).toBeGreaterThan(0);
		}
	});

	it("sperren Kundengelder bis zur Erlaubnis", () => {
		const k = roadmap.PHASES.find((p) => p.key === "phase-k");
		expect(k?.status).toBe("locked");
		expect(k?.requires).toMatch(/Erlaubnis/);
	});

	it("zeigen den Zahlungsweg als Ziel, nicht als Angebot", () => {
		expect(landing.GOAL_NOTE.label).toMatch(/Ziel/);
		expect(landing.GOAL_NOTE.label).toMatch(/Erlaubnis/);
		expect(landing.GOAL_NOTE.text).toMatch(/Erlaubnis/);
		const goalRow = landing.STAND.rows.find((r) => r.key === "ziel");
		expect(goalRow?.label).toMatch(/Ziel/);
		expect(goalRow?.label).toMatch(/Erlaubnis/);
		expect(landing.HERO.today).toMatch(/^Heute/);
		expect(roadmap.GOAL.note).toMatch(/Erlaubnis/);
		const [first, ...rest] = roadmap.STAGES;
		expect(first?.status).toBe("live");
		for (const stage of rest) {
			expect(stage.status, stage.key).toBe("locked");
			expect(stage.requires, stage.key).toMatch(/Erlaubnis/);
		}
	});

	// Bot (geplant): nie als laufend, nie als Angebot an Kund:innen, nie mit
	// Gewinnversprechen; der Hinweis auf Verluste steht immer dabei
	describe("Automatisch handeln", () => {
		it("ist geplant und zuerst nur für eigene Bestände", () => {
			expect(trading.TRADING.status).toMatch(/geplant/);
			expect(trading.TRADING.status).toMatch(/eigene Bestände/);
			const row = landing.STAND.rows.find((r) => r.key === "geplant");
			expect(row?.tone).toBe("planned");
			for (const step of trading.TRADING_STEPS) {
				expect(step.status, step.key).not.toBe("live");
			}
		});

		it("bleibt für Kund:innen gesperrt bis zur Erlaubnis", () => {
			const last = trading.TRADING_STEPS.at(-1);
			expect(last?.status).toBe("locked");
			expect(last?.requires).toMatch(/Erlaubnis/);
			expect(trading.TRADING.customers).toMatch(/gesperrt/);
			expect(trading.TRADING.customers).toMatch(/Erlaubnis/);
		});

		it("nennt das Risiko und verspricht keinen Gewinn", () => {
			expect(trading.TRADING.risk).toMatch(/verlieren/);
			const promise =
				/rendite|passives einkommen|risikolos|ohne risiko|verdoppel|(sicher|hoh|garantiert)\w*\s+gewinn/i;
			expect(all.filter((t) => promise.test(t))).toEqual([]);
		});

		it("kann nie auszahlen, nur tauschen", () => {
			expect(trading.TRADING.never.items[0]).toMatch(/dieselbe Wallet/);
		});

		// Wunsch 03.11.: per Prompt gesteuert. Die KI macht nur Regeln daraus,
		// ändert sie nie selbst, handelt nie frei und liest nichts Fremdes.
		it("wird per Prompt gesteuert, die KI bleibt in ihren Grenzen", () => {
			const never = trading.TRADING.never.items.join(" ");
			const may = trading.TRADING.may.items.join(" ");
			expect(trading.TRADING.lead).toMatch(/KI/);
			expect(never).toMatch(/Auch die KI kann das nicht/);
			expect(never).toMatch(/nur den Regeln, die du bestätigt hast/);
			expect(may).toMatch(/Fremde Seiten und Nachrichten liest er nicht/);
			expect(trading.TRADING.example.prompt.length).toBeGreaterThan(20);
			const step = trading.TRADING_STEPS.find(
				(s) => s.key === "handeln-prompt",
			);
			expect(step?.status).toBe("planned");
			expect(step?.anchors.map((a) => a.framework)).toContain("AI Act");
		});
	});

	// Wunsch 03.11.: eine Hauptaktion, wenige Fragen
	it("hat eine Hauptaktion und höchstens sechs Fragen", () => {
		expect(landing.HERO.action).toBe(landing.ACCESS.submit);
		expect(landing.ACCESS.submit).toBe("Zugang anfragen");
		expect(landing.FAQ.items.length).toBeLessThanOrEqual(6);
		expect(landing.ACCESS.privacy).toMatch(/12 Monate/);
	});

	// Wunsch 03.11.: einfach zu verstehen. Startseite und Bot in kurzen Sätzen,
	// jedes Fachwort der Seite steht unter „Begriffe kurz erklärt“.
	it("schreibt die Startseite in kurzen Sätzen", () => {
		const long = [...texts(landing), ...texts(trading.TRADING)]
			.flatMap(sentences)
			.filter((s) => words(s) > 24);
		expect(long).toEqual([]);
	});

	it("erklärt die Fachwörter der Startseite", () => {
		const terms = landing.TERMS.items.map((t) => t.term).join(" ");
		for (const word of [
			"Wallet",
			"Knoten",
			"Signer",
			"Sicherheitsschlüssel",
			"Token",
			"Testnetz",
			"KYC",
			"KYB",
			"Travel Rule",
			"Klick",
			"KI",
			"Prompt",
		]) {
			expect(terms, word).toContain(word);
		}
	});

	// Entscheidung 25.10.: das Prinzip beschreiben, den Begriff informeller
	// Transfersysteme nicht nennen (Signal für Partnerbanken und Aufsicht)
	it("vergleichen sich nicht mit informellen Transfersystemen", () => {
		expect(all.filter((t) => /hawala|hundi/i.test(t))).toEqual([]);
	});

	it("haben eindeutige Schlüssel", () => {
		const keys = [
			...roadmap.STAGES,
			...roadmap.TODAY,
			...roadmap.NEXT,
			...roadmap.PHASES,
			...trading.TRADING_STEPS,
		].map((i) => i.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
