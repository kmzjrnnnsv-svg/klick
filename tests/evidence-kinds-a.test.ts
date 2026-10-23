import { describe, expect, it } from "vitest";
import { buildBeschluesse } from "@/lib/evidence-studio/kinds/beschluesse";
import { buildKommunikation } from "@/lib/evidence-studio/kinds/kommunikation";
import {
	buildLeitlinie,
	type LeitlinieFacts,
	markdownBlocks,
} from "@/lib/evidence-studio/kinds/leitlinie";
import { buildParteien } from "@/lib/evidence-studio/kinds/parteien";
import { buildProzesslandkarte } from "@/lib/evidence-studio/kinds/prozesslandkarte";
import { buildRaci } from "@/lib/evidence-studio/kinds/raci";
import { buildRollen } from "@/lib/evidence-studio/kinds/rollen";
import { buildScope } from "@/lib/evidence-studio/kinds/scope";
import { type DocBlock, renderMarkdown } from "@/lib/export/doc-model";

const md = (blocks: DocBlock[]) =>
	renderMarkdown({ title: "T", org: "O", meta: [], blocks });
const tables = (blocks: DocBlock[]) =>
	blocks.filter(
		(b): b is Extract<DocBlock, { type: "table" }> => b.type === "table",
	);

describe("NW-PARTEIEN", () => {
	it("Parteien mit Art, Rahmenwerken und offener Berücksichtigung", () => {
		const { blocks } = buildParteien({
			parties: [
				{
					name: "BaFin",
					type: "regulator",
					expectations: "Erlaubnis",
					requirements: "MiCAR, DORA",
					frameworks: ["dora", "micar"],
					howAddressed: "Meldewesen",
					owner: "A",
					reviewAt: "2027-01-01",
				},
				{
					name: "Kund:innen",
					type: "customer",
					expectations: null,
					requirements: null,
					frameworks: [],
					howAddressed: null,
					owner: null,
					reviewAt: null,
				},
			],
		});
		const [t] = tables(blocks);
		expect(t?.rows[0]?.[1]).toBe("Aufsicht");
		expect(t?.rows[0]?.[4]).toBe("DORA, MiCAR + KMAG");
		expect(t?.rows[1]?.[5]).toBe("offen");
		expect(md(blocks)).toContain("Für 1 davon ist festgelegt");
	});

	it("leer: Hinweis statt Tabelle", () => {
		expect(md(buildParteien({ parties: [] }).blocks)).toContain(
			"Noch keine interessierten Parteien erfasst.",
		);
	});
});

describe("NW-SCOPE", () => {
	it("freigegebener Geltungsbereich zuerst, Ausschlüsse mit Begründung", () => {
		const { blocks } = buildScope({
			scopes: [
				{
					framework: null,
					statement: "Entwurf",
					boundaries: null,
					locations: [],
					services: [],
					exclusions: [],
					version: "0.1",
					status: "draft",
					approvedBy: null,
					approvedAt: null,
				},
				{
					framework: "iso27001",
					statement: "Betrieb der Zahlungsplattform",
					boundaries: "ohne Vertrieb",
					locations: ["Frankfurt"],
					services: ["Zahlungen"],
					exclusions: [
						{ what: "A.7.4", justification: "kein eigenes Gebäude" },
					],
					version: "1.0",
					status: "approved",
					approvedBy: "GF",
					approvedAt: "2026-10-01T10:00:00Z",
				},
			],
		});
		const first = blocks.find((b) => b.type === "heading");
		expect(first?.type === "heading" && first.text).toBe(
			"Geltungsbereich ISO 27001",
		);
		const out = md(blocks);
		expect(out).toContain("| A.7.4 | kein eigenes Gebäude |");
		expect(out).toContain("01.10.2026 durch GF");
		expect(out).toContain("Keine Standorte genannt.");
	});

	it("ohne Geltungsbereich: Hinweis", () => {
		expect(md(buildScope({ scopes: [] }).blocks)).toContain(
			"Noch kein Geltungsbereich festgelegt.",
		);
	});
});

describe("NW-PROZESSLANDKARTE", () => {
	it("nach Art gruppiert, kritische ohne RTO gezählt", () => {
		const p = (
			code: string,
			category: "core" | "support",
			criticality: "critical" | "standard",
			rtoHours: number | null,
		) => ({
			code,
			name: `Prozess ${code}`,
			category,
			parent: null,
			owner: code === "P-01" ? "A" : null,
			criticality,
			rtoHours,
			rpoHours: null,
			status: "active" as const,
		});
		const { blocks } = buildProzesslandkarte({
			processes: [
				p("P-01", "core", "critical", null),
				p("P-02", "support", "standard", 24),
			],
		});
		const kv = blocks.find((b) => b.type === "keyValue");
		expect(kv?.type === "keyValue" && kv.items).toContainEqual([
			"kritisch ohne Wiederanlaufziel",
			"1",
		]);
		const heads = blocks
			.filter((b) => b.type === "heading")
			.map((b) => (b.type === "heading" ? b.text : ""));
		expect(heads).toEqual(["Kernprozesse", "Unterstützungsprozesse"]);
		expect(tables(blocks)[1]?.rows[0]?.[3]).toBe("offen");
	});
});

describe("NW-RACI", () => {
	it("meldet Prozesse ohne genau ein A", () => {
		const { blocks } = buildRaci({
			processes: [
				{ code: "P-01", name: "Ok", R: ["X"], A: ["GF"], C: [], I: [] },
				{ code: "P-02", name: "Zwei", R: [], A: ["A", "B"], C: [], I: [] },
				{ code: "P-03", name: "Leer", R: [], A: [], C: [], I: [] },
			],
		});
		expect(tables(blocks)[0]?.rows[2]?.[2]).toBe("fehlt");
		const out = md(blocks);
		expect(out).toContain("P-02 Zwei: 2 rechenschaftspflichtige Stellen");
		expect(out).toContain("P-03 Leer: keine rechenschaftspflichtige Stellen");
		expect(out).not.toContain("P-01 Ok:");
	});
});

describe("NW-ROLLEN", () => {
	it("Besetzung, Einladung, Fit & Proper nur als Status, offene Pflichtfunktionen", () => {
		const { blocks } = buildRollen({
			assignments: [
				{
					function: "management_body",
					holder: "E. Muster",
					invited: false,
					deputy: "M. Muster",
					appointedAt: "2026-01-01",
					reviewAt: null,
					fitProperStatus: "confirmed",
				},
				{
					function: "dpo",
					holder: "dsb@example.org",
					invited: true,
					deputy: null,
					appointedAt: null,
					reviewAt: null,
					fitProperStatus: "not_required",
				},
			],
			missing: ["Geldwäschebeauftragte:r"],
			deputyMissing: [],
		});
		const [t] = tables(blocks);
		expect(t?.rows[0]?.[0]).toBe("Leitungsorgan / Geschäftsleitung");
		expect(t?.rows[0]?.[5]).toBe("bestätigt");
		expect(t?.rows[1]?.[1]).toBe("dsb@example.org (eingeladen)");
		expect(md(blocks)).toContain("Geldwäschebeauftragte:r: nicht besetzt");
	});

	it("alles besetzt", () => {
		expect(
			md(
				buildRollen({ assignments: [], missing: [], deputyMissing: [] }).blocks,
			),
		).toContain("Alle Pflichtfunktionen der aktiven Rahmenwerke sind besetzt.");
	});
});

describe("NW-BESCHLUESSE", () => {
	it("Register mit Organ, Datum und Bezug", () => {
		const { blocks } = buildBeschluesse({
			resolutions: [
				{
					number: "B-2026-003",
					date: "2026-10-01",
					body: "management",
					subject: "Leitlinie",
					decision: "freigegeben",
					legalBasis: "ISO 27001 5.2",
					frameworks: ["iso27001"],
				},
			],
		});
		const out = md(blocks);
		expect(out).toContain(
			"| B-2026-003 | 01.10.2026 | Geschäftsleitung | Leitlinie | freigegeben | ISO 27001, ISO 27001 5.2 |",
		);
		expect(md(buildBeschluesse({ resolutions: [] }).blocks)).toContain(
			"Noch keine Beschlüsse erfasst.",
		);
	});
});

describe("NW-KOMMUNIKATION", () => {
	it("nach Anlass gruppiert, Verantwortung offen markiert", () => {
		const base = {
			party: "BaFin",
			audience: null,
			purpose: "Meldung",
			channel: "MVP-Portal",
			frequency: "4 h",
			legalBasis: "DORA Art. 19",
		};
		const { blocks } = buildKommunikation({
			items: [
				{ ...base, topic: "Vorfallmeldung", trigger: "incident", owner: null },
				{ ...base, topic: "Jahresbericht", trigger: "regular", owner: "ISB" },
			],
		});
		const heads = blocks
			.filter((b) => b.type === "heading")
			.map((b) => (b.type === "heading" ? b.text : ""));
		expect(heads).toEqual(["Regelkommunikation", "Bei Vorfällen"]);
		expect(tables(blocks)[1]?.rows[0]?.[4]).toBe("offen");
		expect(tables(blocks)[0]?.rows[0]?.[3]).toBe("MVP-Portal, 4 h");
		expect(md(buildKommunikation({ items: [] }).blocks)).toContain(
			"Noch keine Kommunikation festgelegt.",
		);
	});
});

describe("NW-LEITLINIE", () => {
	const base: LeitlinieFacts = {
		docNumber: "RL-001",
		title: "Leitlinie zur Informationssicherheit",
		status: "published",
		version: "1.0",
		approvedAt: "2026-10-01T10:00:00Z",
		approvedBy: "GF",
		effectiveFrom: "2026-10-01",
		nextReviewAt: "2027-10-01",
		body: null,
		file: null,
	};

	it("Markdown → Überschriften, Listen, Absätze", () => {
		const blocks = markdownBlocks(
			"# Leitlinie\n\n## Ziele\nWir schützen **Daten**.\nAuch Systeme.\n\n- Vertraulichkeit\n- Integrität\n1. Erstens",
		);
		expect(blocks.map((b) => b.type)).toEqual([
			"heading",
			"heading",
			"paragraph",
			"list",
		]);
		expect(blocks[2]).toEqual({
			type: "paragraph",
			text: "Wir schützen Daten. Auch Systeme.",
		});
		expect(blocks[3]).toEqual({
			type: "list",
			items: ["Vertraulichkeit", "Integrität", "Erstens"],
		});
	});

	it("Wortlaut der freigegebenen Fassung", () => {
		const r = buildLeitlinie({ ...base, body: "## Geltung\nAlle." });
		expect(r.title).toBe("Leitlinie zur Informationssicherheit");
		const out = md(r.blocks);
		expect(out).toContain("## Wortlaut der freigegebenen Fassung");
		expect(out).toContain("01.10.2026 durch GF");
		expect(out).toContain("veröffentlicht");
	});

	it("hochgeladene Datei: Name und Prüfsumme statt Text", () => {
		const out = md(
			buildLeitlinie({
				...base,
				file: { name: "leitlinie.pdf", sha256: "ab".repeat(32) },
			}).blocks,
		);
		expect(out).toContain(
			`Inhalt: freigegebene Datei leitlinie.pdf, SHA-256 ${"ab".repeat(32)}.`,
		);
	});
});
