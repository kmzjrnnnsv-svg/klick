import { z } from "zod";
import {
	type BlockDef,
	CHECK_VALUES,
	type CheckValue,
	type EvidenceTemplate,
	RESULT_VALUES,
	type ResultValue,
	tableColumns,
} from "./templates";

// Inhalt eines verfassten Nachweises (pure): je Baustein ein Wert, passend
// zur Vorlage. Wird verschlüsselt gespeichert (Entwurf und Nachweis) und
// beim Abschließen gerendert.

export type ChecklistRow = {
	text: string;
	result: CheckValue | "";
	note: string;
};
export type MeasureRow = {
	text: string;
	owner: string;
	ownerUserId: string | null;
	due: string;
};
export type SectionRow = { heading: string; body: string };

export type BlockValue =
	| { kind: "fields"; values: Record<string, string> }
	| { kind: "text"; text: string }
	| { kind: "list"; items: string[] }
	| { kind: "table"; rows: string[][] }
	| { kind: "checklist"; rows: ChecklistRow[] }
	| { kind: "result"; value: ResultValue | ""; note: string }
	| { kind: "measures"; rows: MeasureRow[] }
	| { kind: "sections"; rows: SectionRow[] };

export type AuthoredContent = { v: 1; blocks: Record<string, BlockValue> };

const short = z.string().max(500);
const long = z.string().max(20_000);
const cellText = z.string().max(2_000);
const isoDate = z.union([z.literal(""), z.iso.date()]);

export const blockValueSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("fields"),
		values: z.record(z.string().max(40), short),
	}),
	z.object({ kind: z.literal("text"), text: long }),
	z.object({ kind: z.literal("list"), items: z.array(cellText).max(200) }),
	z.object({
		kind: z.literal("table"),
		rows: z.array(z.array(cellText).max(12)).max(500),
	}),
	z.object({
		kind: z.literal("checklist"),
		rows: z
			.array(
				z.object({
					text: cellText,
					result: z.union([z.literal(""), z.enum(CHECK_VALUES)]),
					note: cellText,
				}),
			)
			.max(200),
	}),
	z.object({
		kind: z.literal("result"),
		value: z.union([z.literal(""), z.enum(RESULT_VALUES)]),
		note: long,
	}),
	z.object({
		kind: z.literal("measures"),
		rows: z
			.array(
				z.object({
					text: cellText,
					owner: short,
					ownerUserId: z.uuid().nullable(),
					due: isoDate,
				}),
			)
			.max(100),
	}),
	z.object({
		kind: z.literal("sections"),
		rows: z.array(z.object({ heading: short, body: long })).max(50),
	}),
]);

export const authoredContentSchema = z.object({
	v: z.literal(1),
	blocks: z.record(z.string().max(40), blockValueSchema),
});

export type PrefillContext = {
	today: string;
	me: string;
	// Prüffragen der gewählten Controls (Checkliste „aus den Controls“)
	questions?: readonly string[];
	preset?: string | null;
};

function emptyBlock(
	template: EvidenceTemplate,
	block: BlockDef,
	ctx: PrefillContext,
): BlockValue {
	switch (block.kind) {
		case "fields":
			return {
				kind: "fields",
				values: Object.fromEntries(
					block.fields.map((f) => [
						f.key,
						f.initial === "today"
							? ctx.today
							: f.initial === "me"
								? ctx.me
								: "",
					]),
				),
			};
		case "text":
			return { kind: "text", text: "" };
		case "list":
			return { kind: "list", items: [] };
		case "table": {
			const cols = tableColumns(template, block, ctx.preset ?? null);
			return {
				kind: "table",
				rows: (block.rows ?? []).map((r) => cols.map((_, i) => r[i] ?? "")),
			};
		}
		case "checklist": {
			const items = [
				...(block.items ?? []),
				...(block.fromControlQuestions ? (ctx.questions ?? []) : []),
			];
			return {
				kind: "checklist",
				rows: [...new Set(items)].map((text) => ({
					text,
					result: "",
					note: "",
				})),
			};
		}
		case "result":
			return { kind: "result", value: "", note: "" };
		case "measures":
			return { kind: "measures", rows: [] };
		case "sections":
			return { kind: "sections", rows: [{ heading: "", body: "" }] };
	}
}

export function emptyContent(
	template: EvidenceTemplate,
	ctx: PrefillContext,
): AuthoredContent {
	return {
		v: 1,
		blocks: Object.fromEntries(
			template.blocks.map((b) => [b.id, emptyBlock(template, b, ctx)]),
		),
	};
}

// Inhalt an die Vorlage angleichen: fehlende Bausteine ergänzen, fremde und
// falsch typisierte verwerfen, Tabellenzeilen auf die Spaltenzahl bringen
export function normalizeContent(
	template: EvidenceTemplate,
	content: AuthoredContent,
	ctx: PrefillContext,
): AuthoredContent {
	const blocks: Record<string, BlockValue> = {};
	for (const b of template.blocks) {
		const v = content.blocks[b.id];
		if (!v || v.kind !== b.kind) {
			blocks[b.id] = emptyBlock(template, b, ctx);
			continue;
		}
		if (v.kind === "table" && b.kind === "table") {
			const n = tableColumns(template, b, ctx.preset ?? null).length;
			blocks[b.id] = {
				kind: "table",
				rows: v.rows.map((r) =>
					Array.from({ length: n }, (_, i) => r[i] ?? ""),
				),
			};
			continue;
		}
		if (v.kind === "fields" && b.kind === "fields") {
			blocks[b.id] = {
				kind: "fields",
				values: Object.fromEntries(
					b.fields.map((f) => [f.key, v.values[f.key] ?? ""]),
				),
			};
			continue;
		}
		blocks[b.id] = v;
	}
	return { v: 1, blocks };
}

const filled = (s: string | undefined | null) => Boolean(s?.trim());
const rowFilled = (r: readonly string[]) => r.some(filled);

// Was fehlt noch zum Abschließen? Bezeichnungen in der Reihenfolge der Vorlage.
export function missingForFinalize(
	template: EvidenceTemplate,
	content: AuthoredContent,
): string[] {
	const out: string[] = [];
	for (const b of template.blocks) {
		const v = content.blocks[b.id];
		switch (b.kind) {
			case "fields":
				for (const f of b.fields)
					if (f.required && !(v?.kind === "fields" && filled(v.values[f.key])))
						out.push(f.label);
				break;
			case "text":
				if (b.required && !(v?.kind === "text" && filled(v.text)))
					out.push(b.title);
				break;
			case "list":
				if (b.required && !(v?.kind === "list" && v.items.some(filled)))
					out.push(b.title);
				break;
			case "table":
				if (b.required && !(v?.kind === "table" && v.rows.some(rowFilled)))
					out.push(b.title);
				break;
			case "checklist":
				if (
					b.required &&
					!(
						v?.kind === "checklist" &&
						v.rows.some((r) => filled(r.text)) &&
						v.rows.every((r) => !filled(r.text) || r.result !== "")
					)
				)
					out.push(b.title);
				break;
			case "result":
				if (b.required && !(v?.kind === "result" && v.value !== ""))
					out.push(b.title);
				break;
			case "sections":
				if (
					b.required &&
					!(
						v?.kind === "sections" &&
						v.rows.some((r) => filled(r.heading) || filled(r.body))
					)
				)
					out.push(b.title ?? "Text");
				break;
			case "measures":
				break;
		}
	}
	return out;
}

export function resultOf(content: AuthoredContent): ResultValue | null {
	for (const v of Object.values(content.blocks))
		if (v.kind === "result" && v.value !== "") return v.value;
	return null;
}

export function measuresOf(content: AuthoredContent): MeasureRow[] {
	return Object.values(content.blocks).flatMap((v) =>
		v.kind === "measures" ? v.rows.filter((r) => filled(r.text)) : [],
	);
}

// Datum, an dem der Nachweis entstand (erstes Datumsfeld im Kopf)
export function contentDate(
	template: EvidenceTemplate,
	content: AuthoredContent,
): string | null {
	for (const b of template.blocks) {
		if (b.kind !== "fields") continue;
		const v = content.blocks[b.id];
		if (v?.kind !== "fields") continue;
		for (const f of b.fields)
			if (f.type === "date" && f.key === "date" && filled(v.values[f.key]))
				return v.values[f.key] as string;
	}
	return null;
}
