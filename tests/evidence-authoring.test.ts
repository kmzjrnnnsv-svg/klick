import { describe, expect, it } from "vitest";
import { CATALOG_FRAMEWORKS, CONTROLS } from "@/lib/compliance/catalog";
import {
	EVIDENCE_KINDS,
	evidenceKindForHint,
} from "@/lib/compliance/catalog/evidence-kinds";
import {
	type AuthoredContent,
	authoredContentSchema,
	contentDate,
	emptyContent,
	measuresOf,
	missingForFinalize,
	normalizeContent,
	resultOf,
} from "@/lib/evidence-authoring/content";
import {
	authoredBlocks,
	authoredDoc,
	authoredHash,
} from "@/lib/evidence-authoring/render";
import { suggestTemplate } from "@/lib/evidence-authoring/suggest";
import {
	EVIDENCE_TEMPLATES,
	TEMPLATE_BY_KEY,
	tableColumns,
} from "@/lib/evidence-authoring/templates";
import { renderMarkdown } from "@/lib/export/doc-model";
import { renderPdf } from "@/lib/export/pdf";

const ctx = { today: "2026-10-24", me: "Erika Muster" };
const tpl = (key: string) => {
	const t = TEMPLATE_BY_KEY.get(key);
	if (!t) throw new Error(key);
	return t;
};

// Inhalt, in dem jeder Baustein ausgefüllt ist
function filledContent(key: string): AuthoredContent {
	const t = tpl(key);
	const c = emptyContent(t, {
		...ctx,
		questions: ["Gibt es eine Richtlinie?"],
	});
	for (const b of t.blocks) {
		const v = c.blocks[b.id];
		if (!v) continue;
		if (v.kind === "fields" && b.kind === "fields")
			for (const f of b.fields)
				v.values[f.key] ||=
					f.type === "date"
						? "2026-10-20"
						: f.type === "select"
							? (f.options?.[0] ?? "x")
							: `${f.label} Wert`;
		if (v.kind === "text") v.text = "Erster Absatz.\n\nZweiter Absatz.";
		if (v.kind === "list") v.items = ["Punkt eins", "Punkt zwei"];
		if (v.kind === "table" && b.kind === "table") {
			const cols = tableColumns(t, b, null);
			v.rows = [
				cols.map((col) => (col.type === "date" ? "2026-10-01" : col.label)),
			];
		}
		if (v.kind === "checklist") {
			if (v.rows.length === 0)
				v.rows = [{ text: "Punkt", result: "", note: "" }];
			for (const r of v.rows) r.result = "yes";
			v.rows[0] = {
				...(v.rows[0] as (typeof v.rows)[number]),
				result: "partial",
				note: "Nachbessern",
			};
		}
		if (v.kind === "result") {
			v.value = "partial";
			v.note = "Zwei Abweichungen";
		}
		if (v.kind === "measures")
			v.rows = [
				{
					text: "Nachschulung",
					owner: "Max",
					ownerUserId: null,
					due: "2026-11-30",
				},
			];
		if (v.kind === "sections") v.rows = [{ heading: "Ablauf", body: "Text." }];
	}
	return c;
}

describe("Rohlinge — Katalog", () => {
	it("Schlüssel, Codes und Baustein-IDs sind eindeutig", () => {
		const keys = EVIDENCE_TEMPLATES.map((t) => t.key);
		const codes = EVIDENCE_TEMPLATES.map((t) => t.code);
		expect(new Set(keys).size).toBe(keys.length);
		expect(new Set(codes).size).toBe(codes.length);
		const kindCodes = new Set(EVIDENCE_KINDS.map((k) => k.code));
		for (const t of EVIDENCE_TEMPLATES) {
			expect(t.code).toMatch(/^RL-[A-Z]+$/);
			expect(kindCodes.has(t.code)).toBe(false);
			const ids = t.blocks.map((b) => b.id);
			expect(new Set(ids).size, t.key).toBe(ids.length);
			expect(t.reviewMonths).toBeGreaterThan(0);
			expect(t.signers.length).toBeGreaterThan(0);
		}
	});

	it("jeder Rohling hat einen Kopf mit Datum und Person, Auswahlfelder haben Optionen", () => {
		for (const t of EVIDENCE_TEMPLATES) {
			const head = t.blocks.find((b) => b.kind === "fields");
			expect(head, t.key).toBeTruthy();
			if (head?.kind !== "fields") continue;
			expect(
				head.fields.some((f) => f.initial === "today"),
				t.key,
			).toBe(true);
			expect(
				head.fields.some((f) => f.initial === "me"),
				t.key,
			).toBe(true);
			for (const b of t.blocks) {
				if (b.kind === "fields")
					for (const f of b.fields)
						if (f.type === "select")
							expect(f.options?.length, `${t.key}.${f.key}`).toBeGreaterThan(1);
				if (b.kind === "table")
					for (const c of b.columns)
						if (c.type === "select")
							expect(c.options?.length, `${t.key}.${c.key}`).toBeGreaterThan(1);
			}
		}
	});

	it("Rohlinge mit Wirksamkeitstest haben einen Ergebnis-Baustein", () => {
		for (const t of EVIDENCE_TEMPLATES.filter((x) => x.testMethod))
			expect(
				t.blocks.some((b) => b.kind === "result" || b.kind === "checklist"),
				t.key,
			).toBe(true);
	});

	it("Listen-Vorlagen haben eindeutige Schlüssel und Spalten", () => {
		const presets = tpl("liste").presets ?? [];
		expect(presets.length).toBeGreaterThanOrEqual(6);
		expect(new Set(presets.map((p) => p.key)).size).toBe(presets.length);
		for (const p of presets) expect(p.columns.length).toBeGreaterThan(2);
	});
});

describe("Rohlinge — Inhalt", () => {
	it("Vorbelegung: heute, eigener Name, Kennzahlen-Zeilen, Prüffragen ohne Doppel", () => {
		const c = emptyContent(tpl("uebung"), ctx);
		const head = c.blocks.head;
		expect(head?.kind === "fields" && head.values.date).toBe("2026-10-24");
		expect(head?.kind === "fields" && head.values.by).toBe("Erika Muster");
		const targets = c.blocks.targets;
		expect(targets?.kind === "table" && targets.rows.length).toBe(3);
		const cl = emptyContent(tpl("checkliste"), {
			...ctx,
			questions: ["Gibt es X?", "Gibt es X?", "Wird Y geprüft?"],
		}).blocks.checks;
		expect(cl?.kind === "checklist" && cl.rows.map((r) => r.text)).toEqual([
			"Gibt es X?",
			"Wird Y geprüft?",
		]);
	});

	it("Listen-Vorlage bestimmt die Spalten", () => {
		const t = tpl("liste");
		const block = t.blocks.find((b) => b.id === "entries");
		if (block?.kind !== "table") throw new Error("entries");
		expect(tableColumns(t, block, "kontakte").map((c) => c.label)).toContain(
			"Telefon",
		);
		expect(tableColumns(t, block, null).map((c) => c.label)).toContain(
			"Eintrag",
		);
	});

	it("angleichen: fremde Bausteine weg, Zeilen auf Spaltenzahl, Felder vollständig", () => {
		const t = tpl("rezertifizierung");
		const c: AuthoredContent = {
			v: 1,
			blocks: {
				head: { kind: "text", text: "falscher Typ" },
				accounts: { kind: "table", rows: [["a", "b"]] },
				fremd: { kind: "list", items: ["x"] },
			},
		};
		const n = normalizeContent(t, c, ctx);
		expect(Object.keys(n.blocks)).not.toContain("fremd");
		expect(n.blocks.head?.kind).toBe("fields");
		const acc = n.blocks.accounts;
		expect(acc?.kind === "table" && acc.rows[0]).toEqual([
			"a",
			"b",
			"",
			"",
			"",
		]);
	});

	it("Pflichtangaben fehlen zuerst, ausgefüllt fehlt nichts", () => {
		const t = tpl("rezertifizierung");
		const missing = missingForFinalize(t, emptyContent(t, ctx));
		expect(missing).toEqual([
			"System / Anwendung",
			"Stand der Kontenliste",
			"Quelle der Liste",
			"Konten",
			"Ergebnis",
		]);
		for (const tt of EVIDENCE_TEMPLATES)
			expect(missingForFinalize(tt, filledContent(tt.key)), tt.key).toEqual([]);
	});

	it("Checkliste ist erst vollständig, wenn jeder Punkt ein Ergebnis hat", () => {
		const t = tpl("begehung");
		const c = filledContent("begehung");
		const cl = c.blocks.checks;
		if (cl?.kind !== "checklist") throw new Error();
		cl.rows[1] = { ...(cl.rows[1] as (typeof cl.rows)[number]), result: "" };
		expect(missingForFinalize(t, c)).toEqual(["Prüfpunkte"]);
	});

	it("Ergebnis, Maßnahmen und Datum lesen", () => {
		const c = filledContent("uebung");
		expect(resultOf(c)).toBe("partial");
		expect(measuresOf(c).map((m) => m.text)).toEqual(["Nachschulung"]);
		expect(contentDate(tpl("uebung"), c)).toBe("2026-10-24");
	});

	it("Schema prüft Inhalte und Grenzen", () => {
		expect(
			authoredContentSchema.safeParse(filledContent("pruefung")).success,
		).toBe(true);
		const bad = filledContent("vermerk");
		(bad.blocks.facts as { kind: "text"; text: string }).text = "x".repeat(
			20_001,
		);
		expect(authoredContentSchema.safeParse(bad).success).toBe(false);
		expect(
			authoredContentSchema.safeParse({
				v: 1,
				blocks: { r: { kind: "result", value: "gut", note: "" } },
			}).success,
		).toBe(false);
	});
});

describe("Rohlinge — Dokument", () => {
	it("jeder Rohling rendert vollständig zu PDF und Markdown", () => {
		for (const t of EVIDENCE_TEMPLATES) {
			const content = filledContent(t.key);
			const meta = {
				template: t.key,
				preset: null,
				title: `${t.title} Test`,
				controls: ["CC-BCM-03"],
				signers: ["-"],
			};
			const hash = authoredHash(meta, content);
			const doc = authoredDoc({
				template: t,
				meta,
				content,
				org: "Muster GmbH",
				today: "2026-10-24",
				version: 1,
				evidenceId: "00000000-0000-4000-8000-000000000000",
				contentSha256: hash,
				requirements: ["iso27001:A.8.13"],
				signers: [{ function: "-", mode: "any", holders: ["Erika Muster"] }],
			});
			const md = renderMarkdown(doc);
			expect(md, t.key).toContain(`${t.title} Test`);
			expect(md, t.key).toContain("Erstellt von");
			expect(md, t.key).not.toContain("Keine Angaben.");
			const pdf = renderPdf(doc, { now: new Date("2026-10-24T10:00:00Z") });
			expect(new TextDecoder().decode(pdf.slice(0, 5)), t.key).toBe("%PDF-");
		}
	});

	it("leere Bausteine stehen als „Keine Angaben.“ im Dokument", () => {
		const t = tpl("vermerk");
		const blocks = authoredBlocks(t, emptyContent(t, ctx), null);
		expect(
			blocks.filter(
				(b) => b.type === "paragraph" && b.text === "Keine Angaben.",
			).length,
		).toBeGreaterThan(1);
	});

	it("Checkliste mit Zusammenfassung, Datum lesbar", () => {
		const t = tpl("wiederherstellung");
		const blocks = authoredBlocks(t, filledContent(t.key), null);
		const summary = blocks.find(
			(b) => b.type === "paragraph" && b.text.includes("Prüfpunkte:"),
		);
		expect(summary?.type === "paragraph" && summary.text).toBe(
			"6 Prüfpunkte: 5 erfüllt, 1 teilweise.",
		);
		const kv = blocks.find((b) => b.type === "keyValue");
		expect(
			kv?.type === "keyValue" &&
				kv.items.find(([l]) => l === "Sicherung vom")?.[1],
		).toBe("20.10.2026");
	});

	it("Prüfsumme hängt an Inhalt und Angaben, nicht an der Reihenfolge der Schlüssel", () => {
		const meta = {
			template: "vermerk",
			preset: null,
			title: "A",
			controls: ["CC-GOV-01"],
			signers: ["-"],
		};
		const c = filledContent("vermerk");
		const h1 = authoredHash(meta, c);
		const reordered = {
			signers: ["-"],
			controls: ["CC-GOV-01"],
			title: "A",
			preset: null,
			template: "vermerk",
		};
		expect(authoredHash(reordered, c)).toBe(h1);
		expect(authoredHash({ ...meta, title: "B" }, c)).not.toBe(h1);
		(c.blocks.facts as { kind: "text"; text: string }).text = "anders";
		expect(authoredHash(meta, c)).not.toBe(h1);
	});
});

describe("Rohlinge — Vorschlag je Nachweis-Hinweis", () => {
	it.each([
		["Restore-Protokolle", "wiederherstellung", null],
		["Protokolle der Wiederherstellungstests", "wiederherstellung", null],
		["Übungsprotokolle", "uebung", null],
		["Rezertifizierungsprotokolle", "rezertifizierung", null],
		["Liste der Schlüsselinhaber:innen", "liste", "schluesselinhaber"],
		["Kontaktliste", "liste", "kontakte"],
		["Freigabeliste privilegierter Werkzeuge", "liste", "werkzeuge"],
		["Liste kritischer Funktionen", "liste", "kritische-funktionen"],
		["Zutrittsprotokolle", "liste", "zutrittsprotokoll"],
		["Liste privilegierter Konten", "liste", "admin-konten"],
		["Privacy-Checkliste", "checkliste", null],
		["Offboarding-Checkliste", "uebergabe", null],
		["Teilnahmelisten", "unterweisung", null],
		["Review-Protokolle", "auswertung", null],
		["Change-Protokolle", "aenderung", null],
		["Einberufungsprotokolle", "besprechung", null],
		["Attestierung", "bestaetigung", null],
		["Vier-Augen-Nachweise", "pruefung", null],
		["TLS-Konfiguration", "konfiguration", null],
		["(P) Firewall-Regelwerk", "konfiguration", null],
	])("%s → %s", (hint, key, preset) => {
		expect(suggestTemplate(hint)).toEqual({ key, preset });
	});

	it.each([
		"Clean-Desk-Richtlinie",
		"Backup-Konzept",
		"Übungsplan",
		"Exit-Pläne",
		"Pentest-Berichte",
		"AV-Verträge",
		"Teilnahmevereinbarung",
		"JML-Prozess",
	])("%s ist ein Dokument oder Upload → kein Rohling", (hint) => {
		expect(suggestTemplate(hint)).toBeNull();
	});

	it("deckt einen großen Teil der freien Hinweise ab, nur mit bekannten Rohlingen", () => {
		const hints = new Set<string>();
		for (const c of CONTROLS)
			for (const h of c.evidenceHints ?? []) hints.add(h);
		for (const f of CATALOG_FRAMEWORKS)
			for (const r of f.requirements)
				for (const h of r.evidenceHints ?? []) hints.add(h);
		const free = [...hints].filter((h) => !evidenceKindForHint(h));
		const suggested = free.map(suggestTemplate).filter((s) => s !== null);
		for (const s of suggested) expect(TEMPLATE_BY_KEY.has(s.key)).toBe(true);
		expect(suggested.length).toBeGreaterThan(150);
	});
});
