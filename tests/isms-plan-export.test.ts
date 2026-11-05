import { describe, expect, it } from "vitest";
import { ISMS_PROGRAMME } from "@/lib/compliance/catalog/isms-programme";
import { ismsPlanSettingsOf } from "@/lib/isms-plan/adjust";
import {
	ISMS_CSV_HEADER,
	type IsmsDocTexts,
	type IsmsExportLabels,
	ismsCsvRows,
	ismsDocBlocks,
} from "@/lib/isms-plan/export";
import type { IsmsFacts } from "@/lib/isms-plan/status";
import { buildIsmsPlanView } from "@/lib/isms-plan/view";

// ISMS-Jahresplan als CSV und PDF (P2c): dasselbe Modell wie die Seite, ohne
// Wortverbinder, entfallene Punkte ohne Zahlen.

const facts: IsmsFacts = {
	today: "2026-11-05",
	documents: {},
	isbAppointed: false,
	risks: { total: 0, current: 0 },
	bia: { critical: 0, current: 0 },
	bcmPlans: { critical: 0, released: 0, overdue: 0 },
	exercises: { lastDone: null, planned: 0 },
	audits: {
		internal: { lastDone: null, next: null },
		external: { lastDone: null, next: null },
	},
	managementReview: { lastHeld: null, next: null },
	kpis: { approved: 0, measured: 0 },
	nonconformities: { open: 0, overdue: 0 },
	suppliers: { running: 0, overdue: 0 },
	trainings: { open: 0, overdue: 0 },
	incidents: { open: 0 },
	changes: { pending: 0 },
};

const labels: IsmsExportLabels = {
	section: (s) => `S:${s}`,
	cadence: (i) => i.cadence,
	review: (i, units) => `${i.key}${units ? `×${units}` : ""}`,
	lead: () => "2⁠–⁠3 Wochen",
	state: (r) => (r.off ? "Entfällt" : (r.status?.state ?? "")),
	statusText: (r) => (r.off ? "weg" : (r.status?.code ?? "")),
	owner: (i) => i.owner,
	retention: (r) => `${r.kind}:${r.years}`,
};

const texts = Object.fromEntries(
	[
		"summary",
		"cardTotal",
		"cardA",
		"cardB",
		"workdays",
		"fte",
		"overview",
		"colSection",
		"colItem",
		"colCadence",
		"colYear",
		"colIsbA",
		"colIsbB",
		"colStatus",
		"total",
		"counts",
		"source",
		"empty",
	].map((k) => [k, k]),
) as IsmsDocTexts;

describe("Jahresplan-Export", () => {
	const settings = ismsPlanSettingsOf({
		workdays: 210,
		items: {
			bcm: { off: { reason: "Liegt beim Konzern, eigener Plan dort." } },
			risk_analyses: { units: 12 },
		},
	});
	const view = buildIsmsPlanView(settings, facts);

	it("CSV: eine Zeile je Punkt, Spalten wie der Kopf", () => {
		const rows = ismsCsvRows(view, labels);
		expect(rows).toHaveLength(ISMS_PROGRAMME.length);
		for (const r of rows) expect(r).toHaveLength(ISMS_CSV_HEADER.length);
		const joined = rows.flat().join("|");
		expect(joined).not.toContain("⁠");
	});

	it("CSV: angepasste und entfallene Punkte", () => {
		const rows = ismsCsvRows(view, labels);
		const col = (name: (typeof ISMS_CSV_HEADER)[number]) =>
			ISMS_CSV_HEADER.indexOf(name);
		const risk = rows.find((r) => r[col("pruefung")] === "risk_analyses×12");
		expect(risk?.[col("pt_von")]).toBe("36");
		expect(risk?.[col("pt_bis")]).toBe("60");
		expect(risk?.[col("angepasst")]).toBe("ja");
		const bia = rows.find((r) => r[col("pruefung")] === "bia");
		expect(bia?.[col("entfaellt")]).toBe("ja");
		expect(bia?.[col("pt_von")]).toBe("");
		expect(bia?.[col("stand")]).toBe("Entfällt");
	});

	it("PDF: Summen, Überblick und ein Abschnitt je Bereich", () => {
		const blocks = ismsDocBlocks(view, labels, texts);
		const headings = blocks.filter((b) => b.type === "heading");
		expect(headings).toHaveLength(1 + view.sections.length);
		const kv = blocks.find((b) => b.type === "keyValue");
		expect(kv && kv.type === "keyValue" && kv.items[3]).toEqual([
			"workdays",
			"210",
		]);
		const tables = blocks.filter((b) => b.type === "table");
		const items = tables
			.slice(1)
			.reduce((n, t) => n + (t.type === "table" ? t.rows.length : 0), 0);
		expect(items).toBe(ISMS_PROGRAMME.length);
		expect(JSON.stringify(blocks)).not.toContain("\u2060");
	});
});
