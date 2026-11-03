import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import { builderFor, POLICY_BUILDERS } from "@/lib/documents/builder";
import {
	changedKeys,
	cleanAnswers,
	policyCompletion,
	prefillAnswers,
	renderPolicy,
	visibleQuestions,
} from "@/lib/documents/builder/render";
import type {
	BuilderAnswers,
	BuilderBlock,
	BuilderCondition,
	PolicyBuilder,
} from "@/lib/documents/builder/types";
import { fillDocumentTokens } from "@/lib/documents/tokens";

// Richtlinien-Baukasten (Teil 5): jede Vorlage ist in sich stimmig — jede
// Frage hat einen Platz im Text, keine Lücke ohne Frage, mit den empfohlenen
// Antworten bleibt keine Lücke offen, Texte nach den Projektregeln.

const ctx = {
	title: "Testrichtlinie",
	orgName: "Beispiel GmbH",
	functionName: (k: string) => `Funktion ${k}`,
};

function texts(b: PolicyBuilder): { text: string; when?: BuilderCondition }[] {
	const out: { text: string; when?: BuilderCondition }[] = [];
	for (const s of b.sections)
		for (const bl of s.blocks as readonly BuilderBlock[]) {
			if (bl.kind === "p") out.push({ text: bl.text, when: bl.when });
			else
				for (const it of bl.items)
					out.push(
						typeof it === "string"
							? { text: it, when: bl.when }
							: { text: it.text, when: it.when ?? bl.when },
					);
		}
	return out;
}

/** Empfohlene (bzw. erste sinnvolle) Antwort je Frage */
function recommendedAnswers(b: PolicyBuilder): BuilderAnswers {
	const a: Record<string, string | number> = {};
	for (const s of b.sections)
		for (const q of s.questions) {
			if (q.kind === "choice")
				a[q.key] = q.recommended ?? q.options[0]?.value ?? "";
			else if (q.kind === "number") a[q.key] = q.recommended ?? q.min;
			else if (q.kind === "function") a[q.key] = q.suggest;
			else a[q.key] = q.example;
		}
	return a;
}

describe("Vorlagen des Baukastens", () => {
	it("zehn Vorlagen, jede mit passender Dokument-Vorlage", () => {
		expect(POLICY_BUILDERS).toHaveLength(10);
		for (const b of POLICY_BUILDERS) {
			expect(TEMPLATE_BY_CODE.has(b.code), b.code).toBe(true);
			expect(builderFor(b.code)).toBe(b);
		}
		expect(builderFor("RL-UNBEKANNT")).toBeNull();
		expect(builderFor(null)).toBeNull();
	});

	for (const b of POLICY_BUILDERS)
		describe(b.code, () => {
			const keys = b.sections.flatMap((s) => s.questions.map((q) => q.key));
			const all = texts(b);
			const gaps = all.flatMap(({ text, when }) =>
				[...text.matchAll(/\{\{a:([a-z0-9_]+)\}\}/g)].map((m) => ({
					key: m[1] ?? "",
					when,
				})),
			);

			it("Aufbau: Zweck zuerst, Schlüssel eindeutig, jeder Abschnitt mit Text", () => {
				expect(b.sections[0]?.id).toBe("zweck");
				expect(b.sections[0]?.heading).toBe("Zweck und Geltungsbereich");
				expect(new Set(keys).size).toBe(keys.length);
				expect(new Set(b.sections.map((s) => s.id)).size).toBe(
					b.sections.length,
				);
				for (const k of [...keys, ...b.sections.map((s) => s.id)])
					expect(k).toMatch(/^[a-z0-9_]+$/);
				for (const s of b.sections) expect(s.blocks.length).toBeGreaterThan(0);
				expect(keys.length).toBeGreaterThanOrEqual(6);
				expect(keys.length).toBeLessThanOrEqual(14);
			});

			it("jede Frage hat einen Platz im Text, keine Lücke ohne Frage", () => {
				const used = new Set(gaps.map((g) => g.key));
				for (const k of keys) expect(used.has(k), `ungenutzt: ${k}`).toBe(true);
				for (const g of gaps)
					expect(keys.includes(g.key), `verwaist: ${g.key}`).toBe(true);
			});

			it("bedingte Fragen nur in Text mit derselben Bedingung", () => {
				const byKey = new Map(
					b.sections.flatMap((s) =>
						s.questions.map((q) => [q.key, q] as const),
					),
				);
				for (const g of gaps) {
					const q = byKey.get(g.key);
					if (q?.when) expect(g.when, g.key).toEqual(q.when);
				}
				// Bedingungen zeigen auf bestehende Auswahlfragen und deren Werte
				for (const c of [
					...all.map((x) => x.when),
					...[...byKey.values()].map((q) => q.when),
				]) {
					if (!c) continue;
					const q = byKey.get(c.key);
					expect(q?.kind, c.key).toBe("choice");
					if (q?.kind === "choice")
						for (const v of c.is)
							expect(q.options.map((o) => o.value)).toContain(v);
				}
			});

			it("Fragen sind gültig (Empfehlung, Bereich, Funktion, Beispiel)", () => {
				for (const s of b.sections)
					for (const q of s.questions) {
						expect(q.label.trim().length).toBeGreaterThan(5);
						expect(q.gap.trim().length).toBeGreaterThan(1);
						if (q.kind === "choice") {
							expect(q.options.length).toBeGreaterThanOrEqual(2);
							if (q.recommended)
								expect(q.options.map((o) => o.value)).toContain(q.recommended);
						}
						if (q.kind === "number") {
							expect(q.min).toBeLessThan(q.max);
							if (q.recommended !== undefined) {
								expect(q.recommended).toBeGreaterThanOrEqual(q.min);
								expect(q.recommended).toBeLessThanOrEqual(q.max);
							}
						}
						if (q.kind === "function")
							expect(ROLE_FUNCTIONS).toContain(q.suggest);
						if (q.kind === "text") expect(q.example.length).toBeGreaterThan(3);
					}
			});

			it("mit den empfohlenen Antworten bleibt keine Lücke offen", () => {
				const answers = recommendedAnswers(b);
				const { markdown, sections } = renderPolicy(b, answers, ctx);
				expect(markdown).not.toMatch(/\{\{a:/);
				expect(markdown).not.toMatch(/\{\{org\}\}/);
				expect(markdown).toContain("Beispiel GmbH");
				expect(
					sections
						.flatMap((s) =>
							s.blocks.flatMap((bl) =>
								bl.kind === "p" ? bl.parts : bl.items.flat(),
							),
						)
						.filter((p) => p.t === "gap"),
				).toEqual([]);
				const c = policyCompletion(b, answers, ctx);
				expect(c.answered).toBe(c.total);
				// Kopf wie die Vorlagen; Platzhalter ersetzt erst die Anzeige
				expect(markdown).toContain("| Dokumentnummer | {{docNumber}} |");
			});

			it("ohne Antworten: jede Lücke sichtbar mit Beispiel", () => {
				const { markdown } = renderPolicy(b, {}, ctx);
				expect(markdown).toMatch(/\[[^\]]+, z\. B\. [^\]]+\]/);
				expect(policyCompletion(b, {}).answered).toBe(0);
			});

			it("Texte nach den Projektregeln", () => {
				const strings = [
					...all.map((x) => x.text),
					...b.sections.flatMap((s) => [
						s.heading,
						...s.questions.flatMap((q) => [
							q.label,
							q.help ?? "",
							q.gap,
							...(q.kind === "choice"
								? q.options.flatMap((o) => [o.label, o.text ?? ""])
								: q.kind === "text"
									? [q.example]
									: []),
						]),
					]),
				];
				for (const t of strings) {
					expect(t, t).not.toContain("—");
					expect(t, t).not.toContain("...");
					// „Sie“/„Ihre“ am Satzanfang meinen hier Dritte („Sie gilt …“)
					expect(t, t).not.toMatch(
						/\b([Ww]ir|[Uu]nser|[Uu]nsere|[Uu]nseren)\b/,
					);
				}
			});
		});
});

describe("Antworten prüfen und rendern", () => {
	const b = builderFor("RL-ENDGERAETE") as PolicyBuilder;

	it("cleanAnswers: nur bekannte Schlüssel und gültige Werte", () => {
		expect(
			cleanAnswers(b, {
				geraete: "firma",
				mdm: "gibt-es-nicht",
				sperre: "5",
				anmeldung: "",
				verwaltung: "isb_ciso",
				meldestelle: "  beim Servicedesk  ",
				fremd: "x",
			}),
		).toEqual({
			geraete: "firma",
			sperre: 5,
			verwaltung: "isb_ciso",
			meldestelle: "beim Servicedesk",
		});
		expect(cleanAnswers(b, { sperre: 0 })).toEqual({});
		expect(cleanAnswers(b, { sperre: 2.5 })).toEqual({});
		expect(cleanAnswers(b, { verwaltung: "chef" })).toEqual({});
		expect(
			cleanAnswers(b, {
				verwaltung: "role:7c9e6679-7425-40de-944b-e07fc1f90ae7",
			}),
		).toEqual({ verwaltung: "role:7c9e6679-7425-40de-944b-e07fc1f90ae7" });
		expect(
			(cleanAnswers(b, { meldestelle: "x".repeat(5000) }).meldestelle as string)
				.length,
		).toBe(2000);
	});

	it("Zahl mit Einzahl und Mehrzahl, Lücke mit Beispiel", () => {
		const one = renderPolicy(b, { sperre: 1 }, ctx).markdown;
		expect(one).toContain("nach 1 Minute ohne Eingabe");
		const five = renderPolicy(b, { sperre: 5 }, ctx).markdown;
		expect(five).toContain("nach 5 Minuten ohne Eingabe");
		const none = renderPolicy(b, {}, ctx).markdown;
		expect(none).toContain("[Bildschirmsperre, z. B. 5 Minuten]");
	});

	it("bedingte Fragen und Texte folgen der Auswahl", () => {
		const firm = { geraete: "firma" };
		expect(visibleQuestions(b, firm).map((q) => q.key)).not.toContain(
			"byod_zugang",
		);
		expect(renderPolicy(b, firm, ctx).markdown).toContain(
			"Private Geräte dürfen nicht auf Daten von Beispiel GmbH zugreifen",
		);
		const byod = { geraete: "firma_byod" };
		expect(visibleQuestions(b, byod).map((q) => q.key)).toContain(
			"byod_zugang",
		);
		expect(renderPolicy(b, byod, ctx).markdown).toContain(
			"[Zugriff privater Geräte, z. B. nur auf Mail und Kalender]",
		);
	});

	it("Vorbelegung nur mit bestellten Funktionen, nie Empfehlungen", () => {
		expect(prefillAnswers(b, new Set())).toEqual({});
		expect(prefillAnswers(b, new Set(["isb_ciso"]))).toEqual({
			verwaltung: "isb_ciso",
		});
	});

	it("changedKeys für das Audit", () => {
		expect(changedKeys({ a: 1, b: "x" }, { a: 2, c: "y" })).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(changedKeys({ a: 1 }, { a: 1 })).toEqual([]);
	});
});

describe("Platzhalter im Kopf (fillDocumentTokens)", () => {
	const head = [
		"| Dokumentnummer | {{docNumber}} |",
		"| Version | {{version}} |",
		"| Eigner:in | {{owner}} |",
		"| Freigabe | {{approver}} |",
		"| Gültig ab | {{effectiveFrom}} |",
		"| Nächster Review | {{nextReviewAt}} |",
		"Contact: mailto:security@{{domain}}",
	].join("\n");

	it("ersetzt die bekannten Platzhalter, andere bleiben", () => {
		const out = fillDocumentTokens(head, {
			docNumber: "RL-007",
			version: "1.2",
			owner: "ISB · Alex Muster",
			approver: "Geschäftsleitung",
			effectiveFrom: "03.11.2026",
			nextReviewAt: "03.11.2027",
		});
		expect(out).toContain("| Dokumentnummer | RL-007 |");
		expect(out).toContain("| Version | 1.2 |");
		expect(out).toContain("| Eigner:in | ISB · Alex Muster |");
		expect(out).toContain("| Freigabe | Geschäftsleitung |");
		expect(out).toContain("| Gültig ab | 03.11.2026 |");
		expect(out).toContain("| Nächster Review | 03.11.2027 |");
		expect(out).toContain("security@{{domain}}");
	});

	it("noch nicht veröffentlicht und fehlende Werte", () => {
		const out = fillDocumentTokens(head, { docNumber: "RL-1", version: "0.1" });
		expect(out).toContain("| Gültig ab | mit der Veröffentlichung |");
		expect(out).toContain("| Eigner:in | – |");
		expect(out).toContain("| Nächster Review | – |");
	});
});
