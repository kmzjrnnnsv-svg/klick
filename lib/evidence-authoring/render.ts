import { createHash } from "node:crypto";
import {
	assembleDoc,
	canonicalJson,
	fmtDay,
	type SignerSlot,
} from "@/lib/evidence-studio/generate/doc";
import type { DocBlock, DocModel } from "@/lib/export/doc-model";
import type { AuthoredContent, BlockValue } from "./content";
import {
	type BlockDef,
	CHECK_LABELS,
	CHECK_VALUES,
	type EvidenceTemplate,
	presetOf,
	RESULT_LABELS,
	tableColumns,
} from "./templates";

// Verfasster Nachweis → Dokumentmodell (pure). Gleiches Layout wie die
// Nachweise aus Registern (assembleDoc): Kopf mit Prüfsumme, Abschnitte,
// „Belegt“, Unterschriften. Leere Bausteine stehen als „Keine Angaben.“
// im Dokument — lückenlos statt stillschweigend weggelassen.

export type AuthoredMeta = {
	template: string;
	preset: string | null;
	title: string;
	controls: string[];
	signers: string[];
};

// Prüfsumme über Vorlage, Titel, Controls und Inhalt (kanonisches JSON)
export function authoredHash(meta: AuthoredMeta, content: AuthoredContent) {
	return createHash("sha256")
		.update(canonicalJson({ v: 1, ...meta, content }))
		.digest("hex");
}

const NONE: DocBlock = {
	type: "paragraph",
	text: "Keine Angaben.",
	muted: true,
};
const filled = (s: string | undefined | null) => Boolean(s?.trim());

function cellValue(type: string | undefined, v: string): string {
	if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDay(v);
	return v;
}

function blockDoc(
	template: EvidenceTemplate,
	def: BlockDef,
	value: BlockValue | undefined,
	preset: string | null,
): DocBlock[] {
	const head = (title?: string): DocBlock[] =>
		title ? [{ type: "heading", level: 2, text: title }] : [];
	switch (def.kind) {
		case "fields": {
			const vals = value?.kind === "fields" ? value.values : {};
			const items = def.fields
				.filter((f) => filled(vals[f.key]))
				.map(
					(f) =>
						[f.label, cellValue(f.type, vals[f.key] as string)] as [
							string,
							string,
						],
				);
			if (items.length === 0)
				return def.title ? [...head(def.title), NONE] : [];
			return [...head(def.title), { type: "keyValue", items }];
		}
		case "text": {
			const text = value?.kind === "text" ? value.text.trim() : "";
			return [
				...head(def.title),
				...(text
					? text
							.split(/\n\s*\n/)
							.map((p): DocBlock => ({ type: "paragraph", text: p.trim() }))
					: [NONE]),
			];
		}
		case "list": {
			const items = value?.kind === "list" ? value.items.filter(filled) : [];
			return [
				...head(def.title),
				items.length > 0 ? { type: "list", items } : NONE,
			];
		}
		case "table": {
			const cols = tableColumns(template, def, preset);
			const rows =
				value?.kind === "table"
					? value.rows
							.filter((r) => r.some(filled))
							.map((r) => cols.map((c, i) => cellValue(c.type, r[i] ?? "")))
					: [];
			return [
				...head(def.title),
				{
					type: "table",
					columns: cols.map((c) => ({ label: c.label, width: c.width })),
					rows,
					empty: "Keine Einträge.",
				},
			];
		}
		case "checklist": {
			const rows =
				value?.kind === "checklist"
					? value.rows.filter((r) => filled(r.text))
					: [];
			const counts = CHECK_VALUES.map(
				(c) => [c, rows.filter((r) => r.result === c).length] as const,
			).filter(([, n]) => n > 0);
			return [
				...head(def.title),
				{
					type: "table",
					columns: [
						{ label: "Prüfpunkt", width: 5 },
						{ label: "Ergebnis", width: 2 },
						{ label: "Bemerkung", width: 4 },
					],
					rows: rows.map((r) => [
						r.text,
						r.result ? CHECK_LABELS[r.result] : "offen",
						r.note,
					]),
					empty: "Keine Prüfpunkte.",
				},
				...(counts.length > 0
					? [
							{
								type: "paragraph" as const,
								text: `${rows.length} Prüfpunkte: ${counts.map(([c, n]) => `${n} ${CHECK_LABELS[c]}`).join(", ")}.`,
								muted: true,
							},
						]
					: []),
			];
		}
		case "result": {
			const v = value?.kind === "result" ? value : null;
			if (!v?.value) return [...head(def.title), NONE];
			return [
				...head(def.title),
				{
					type: "keyValue",
					items: [
						["Urteil", RESULT_LABELS[v.value]],
						...(filled(v.note)
							? ([["Begründung", v.note.trim()]] as [string, string][])
							: []),
					],
				},
			];
		}
		case "measures": {
			const rows =
				value?.kind === "measures"
					? value.rows.filter((r) => filled(r.text))
					: [];
			return [
				...head(def.title),
				{
					type: "table",
					columns: [
						{ label: "Maßnahme", width: 5 },
						{ label: "Verantwortlich", width: 3 },
						{ label: "Frist", width: 2 },
					],
					rows: rows.map((r) => [r.text, r.owner, r.due ? fmtDay(r.due) : ""]),
					empty: "Keine Maßnahmen.",
				},
			];
		}
		case "sections": {
			const rows =
				value?.kind === "sections"
					? value.rows.filter((r) => filled(r.heading) || filled(r.body))
					: [];
			if (rows.length === 0) return [...head(def.title), NONE];
			return [
				...head(def.title),
				...rows.flatMap((r): DocBlock[] => [
					...(filled(r.heading)
						? [
								{
									type: "heading" as const,
									level: 2 as const,
									text: r.heading.trim(),
								},
							]
						: []),
					...r.body
						.trim()
						.split(/\n\s*\n/)
						.filter(filled)
						.map((p): DocBlock => ({ type: "paragraph", text: p.trim() })),
				]),
			];
		}
	}
}

export function authoredBlocks(
	template: EvidenceTemplate,
	content: AuthoredContent,
	preset: string | null,
): DocBlock[] {
	return template.blocks.flatMap((b) =>
		blockDoc(template, b, content.blocks[b.id], preset),
	);
}

export function authoredDoc(input: {
	template: EvidenceTemplate;
	meta: AuthoredMeta;
	content: AuthoredContent;
	org: string;
	today: string;
	version: number;
	evidenceId: string;
	contentSha256: string;
	// Anforderungen, die die gewählten Controls tragen (Schlüssel fw:code)
	requirements: string[];
	signers: SignerSlot[];
}): DocModel {
	const preset = presetOf(input.template, input.meta.preset);
	return assembleDoc({
		kind: {
			code: input.template.code,
			title: input.template.title,
			purpose: input.template.purpose,
			requirements: input.requirements,
		},
		org: input.org,
		today: input.today,
		version: input.version,
		evidenceId: input.evidenceId,
		contentSha256: input.contentSha256,
		title: input.meta.title,
		subtitle: preset?.title ?? input.template.title,
		blocks: [
			{
				type: "keyValue",
				items: [["Controls", input.meta.controls.join(", ") || "—"]],
			},
			...authoredBlocks(input.template, input.content, input.meta.preset),
		],
		signers: input.signers,
	});
}
