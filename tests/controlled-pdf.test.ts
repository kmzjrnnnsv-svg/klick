import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	type ControlledInput,
	controlledDocModel,
	markdownBlocks,
} from "@/lib/documents/controlled-pdf";
import { renderPdf } from "@/lib/export/pdf";

const NOW = new Date("2026-10-28T10:00:00Z");
const HASH = "ab".repeat(32);

const input = (over: Partial<ControlledInput> = {}): ControlledInput => ({
	org: "Muster GmbH",
	doc: {
		docNumber: "RL-001",
		title: "Leitlinie Informationssicherheit",
		typeLabel: "Richtlinie",
		classificationLabel: "intern",
		owner: "Informationssicherheit · Mara Beispiel",
		approverFunction: "Geschäftsleitung",
		retentionYears: 10,
	},
	version: {
		version: "2.0",
		changeSummary: "Rollen ergänzt",
		contentSha256: HASH,
		approvedAt: new Date("2026-10-20T09:00:00Z"),
		publishedAt: new Date("2026-10-21T09:00:00Z"),
		validFrom: new Date("2026-10-21T09:00:00Z"),
		validUntil: null,
		approvedBy: "Erika Muster",
		signers: ["Erika Muster", "Max Muster"],
		lines: { added: 3, removed: 1 },
		editors: ["Mara Beispiel"],
		state: "current",
		bodyMarkdown:
			"# Zweck\n\nDiese Leitlinie gilt.\n\n- Punkt eins\n- Punkt zwei",
		file: null,
	},
	signatures: [
		{
			name: "Erika Muster",
			functionLabel: "Geschäftsleitung",
			signedAt: new Date("2026-10-20T08:00:00Z"),
			credentialId: "cred-1",
			valid: true,
		},
		{
			name: "Max Muster",
			functionLabel: "Geschäftsleitung",
			signedAt: new Date("2026-10-20T08:30:00Z"),
			credentialId: "cred-2",
			valid: false,
		},
	],
	history: [
		{
			version: "2.0",
			changeSummary: "Rollen ergänzt",
			contentSha256: HASH,
			approvedAt: new Date("2026-10-20T09:00:00Z"),
			publishedAt: new Date("2026-10-21T09:00:00Z"),
			validFrom: new Date("2026-10-21T09:00:00Z"),
			validUntil: null,
			approvedBy: "Erika Muster",
			signers: ["Erika Muster", "Max Muster"],
			lines: { added: 3, removed: 1 },
			editors: ["Mara Beispiel"],
		},
		{
			version: "1.0",
			changeSummary: "Erste Fassung",
			contentSha256: "cd".repeat(32),
			approvedAt: new Date("2025-01-10T09:00:00Z"),
			publishedAt: new Date("2025-01-11T09:00:00Z"),
			validFrom: new Date("2025-01-11T09:00:00Z"),
			validUntil: new Date("2026-10-21T09:00:00Z"),
			approvedBy: "Erika Muster",
			signers: [],
			lines: null,
			editors: [],
		},
	],
	distribution: ["Alle Mitglieder"],
	acknowledgements: 4,
	exportId: "11111111-2222-3333-4444-555555555555",
	exportedBy: "Prüferin P.",
	now: NOW,
	...over,
});

describe("PDF „Gelenkte Fassung“", () => {
	it("Deckblatt trägt Nummer, Fassung, Stand, Prüfsumme und Export-ID", () => {
		const m = controlledDocModel(input());
		expect(m.title).toBe("RL-001 Leitlinie Informationssicherheit");
		expect(m.subtitle).toContain("Gelenkte Fassung 2.0");
		const meta = Object.fromEntries(m.meta);
		expect(meta.Fassung).toBe("2.0");
		expect(meta["Stand der Fassung"]).toBe("gültig");
		expect(meta["Prüfsumme der Fassung (SHA-256)"]).toBe(HASH);
		expect(meta["Export-ID"]).toBe("11111111-2222-3333-4444-555555555555");
		expect(m.footer).toContain("ungelenkte Kopie");
	});

	it("Unterschriftenblatt: jede Person mit Funktion und Prüfergebnis", () => {
		const m = controlledDocModel(input());
		const sig = m.blocks.find((b) => b.type === "signatures");
		expect(sig?.type).toBe("signatures");
		if (sig?.type !== "signatures") return;
		expect(sig.signers.map((s) => s.name)).toEqual([
			"Erika Muster",
			"Max Muster",
		]);
		expect(sig.signers[0]?.method).toBe("Passkey, geprüft");
		expect(sig.signers[1]?.method).toContain("FEHLGESCHLAGEN");
	});

	it("Änderungshistorie: je Fassung eine Zeile, Unterschriften genannt", () => {
		const m = controlledDocModel(input());
		const table = m.blocks.find((b) => b.type === "table");
		if (table?.type !== "table") throw new Error("keine Tabelle");
		expect(table.rows).toHaveLength(2);
		expect(table.rows[0]?.[3]).toContain("Erika Muster, Max Muster");
		expect(table.rows[0]?.[2]).toBe(
			"Rollen ergänzt · 3 Zeilen neu, 1 entfernt · bearbeitet von Mara Beispiel",
		);
		expect(table.rows[1]?.[2]).toBe("Erste Fassung");
	});

	it("ohne Unterschrift: Freigabe aus der Entscheidung, sonst nicht freigegeben", () => {
		const legacy = controlledDocModel(input({ signatures: [] }));
		expect(
			legacy.blocks.some(
				(b) => b.type === "keyValue" && b.items[1]?.[1] === "Erika Muster",
			),
		).toBe(true);
		const draft = controlledDocModel(
			input({
				signatures: [],
				version: {
					...input().version,
					approvedAt: null,
					publishedAt: null,
					state: "draft",
				},
			}),
		);
		expect(draft.subtitle).toContain("Entwurf");
		expect(
			draft.blocks.some(
				(b) =>
					b.type === "paragraph" && b.text.includes("noch nicht freigegeben"),
			),
		).toBe(true);
	});

	it("Markdown: Überschriften unter „Inhalt“, Listen und Absätze", () => {
		expect(markdownBlocks("# A\n\nText\nweiter\n\n- x\n- y\n## B")).toEqual([
			{ type: "heading", level: 2, text: "A" },
			{ type: "paragraph", text: "Text weiter" },
			{ type: "list", items: ["x", "y"] },
			{ type: "heading", level: 3, text: "B" },
		]);
	});

	it("rendert ein PDF mit signaturen.json als Anhang", () => {
		const pdf = renderPdf(controlledDocModel(input()), {
			now: NOW,
			attachments: [
				{ name: "signaturen.json", mime: "application/json", data: "{}" },
			],
		});
		const s = Buffer.from(pdf).toString("latin1");
		expect(s.startsWith("%PDF-")).toBe(true);
		expect(s).toContain("signaturen.json");
		// Seiteninhalt enthält das Unterschriftenblatt
		const re = /\/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g;
		const texts: string[] = [];
		for (let m = re.exec(s); m; m = re.exec(s)) {
			const start = m.index + m[0].length;
			texts.push(
				inflateSync(
					Buffer.from(pdf).subarray(start, start + Number(m[1])),
				).toString("latin1"),
			);
		}
		expect(texts.join("\n")).toContain("Freigabe und Unterschriften");
	});
});
