import type {
	IsmsItem,
	IsmsRetention,
	IsmsSection,
	Range,
} from "@/lib/compliance/catalog/isms-programme";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtFte, fmtNum, fmtRange } from "./format";
import type { IsmsPlanView, PlanRow } from "./view";

// ISMS-Jahresplan als Export (P2c, pure): CSV-Zeilen und Blöcke fürs PDF aus
// demselben Modell wie die Seite (buildIsmsPlanView). Texte kommen über
// `labels` von außen (Übersetzungen), damit Seite und Export gleich sprechen.

export type IsmsExportLabels = {
	section: (s: IsmsSection) => string;
	cadence: (item: IsmsItem) => string;
	review: (item: IsmsItem, units?: number) => string;
	lead: (item: IsmsItem) => string;
	state: (row: PlanRow) => string;
	statusText: (row: PlanRow) => string;
	owner: (item: IsmsItem) => string;
	retention: (r: IsmsRetention) => string;
};

// PDF und CSV: ohne Wortverbinder (nicht in WinAnsi, stört in Tabellen)
const plain = (s: string) => s.replace(/⁠/g, "");
const range = (r: Range) => plain(fmtRange(r));

const same = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];

function changed(row: PlanRow): boolean {
	const { item, numbers: n } = row;
	return (
		!same(item.year, n.year) ||
		!same(item.isb.a, n.isbA) ||
		!same(item.isb.b, n.isbB)
	);
}

export const ISMS_CSV_HEADER = [
	"abschnitt",
	"punkt",
	"unterpunkt",
	"normbezug",
	"turnus",
	"pruefung",
	"umsetzung",
	"pt_von",
	"pt_bis",
	"isb_a_von",
	"isb_a_bis",
	"isb_b_von",
	"isb_b_bis",
	"vorlage_pt",
	"angepasst",
	"entfaellt",
	"stand",
	"stand_text",
	"zustaendig",
	"aufbewahrung",
	"in_klick",
] as const;

export function ismsCsvRows(
	view: IsmsPlanView,
	labels: IsmsExportLabels,
): string[][] {
	return view.sections.flatMap(({ section, rows }) =>
		rows.map((row) => {
			const { item, numbers: n, off } = row;
			const zero = (v: number) => (off ? "" : fmtNum(v));
			return [
				labels.section(section),
				item.title,
				row.depth > 0 ? "ja" : "nein",
				item.clauses.map((c) => c.split(":")[1] ?? c).join(", "),
				plain(labels.cadence(item)),
				plain(labels.review(item, off ? undefined : row.adjust?.units)),
				plain(labels.lead(item)),
				zero(n.year[0]),
				zero(n.year[1]),
				zero(n.isbA[0]),
				zero(n.isbA[1]),
				zero(n.isbB[0]),
				zero(n.isbB[1]),
				range(item.year),
				!off && changed(row) ? "ja" : "nein",
				off ? "ja" : "nein",
				labels.state(row),
				plain(labels.statusText(row)),
				labels.owner(item),
				item.retention ? labels.retention(item.retention) : "",
				item.where.map((w) => w.href).join(" "),
			];
		}),
	);
}

export type IsmsDocTexts = {
	summary: string;
	cardTotal: string;
	cardA: string;
	cardB: string;
	workdays: string;
	fte: string;
	overview: string;
	colSection: string;
	colItem: string;
	colCadence: string;
	colYear: string;
	colIsbA: string;
	colIsbB: string;
	colStatus: string;
	total: string;
	counts: string;
	source: string;
	empty: string;
};

export function ismsDocBlocks(
	view: IsmsPlanView,
	labels: IsmsExportLabels,
	text: IsmsDocTexts,
): DocBlock[] {
	const r = view.rollup;
	const blocks: DocBlock[] = [
		{ type: "paragraph", text: text.summary },
		{
			type: "keyValue",
			items: [
				[text.cardTotal, `${range(r.total.year)} PT`],
				[
					text.cardA,
					`${range(r.total.isbA)} PT · ${plain(fmtFte(r.fte.a))} ${text.fte}`,
				],
				[
					text.cardB,
					`${range(r.total.isbB)} PT · ${plain(fmtFte(r.fte.b))} ${text.fte}`,
				],
				[text.workdays, String(view.workdays)],
				[text.colStatus, text.counts],
			],
		},
		{ type: "heading", level: 2, text: text.overview },
		{
			type: "table",
			columns: [
				{ label: text.colSection, width: 52 },
				{ label: text.colYear, width: 16 },
				{ label: text.colIsbA, width: 16 },
				{ label: text.colIsbB, width: 16 },
			],
			rows: [
				...r.sections.map((s, i) => [
					`${i + 1}. ${labels.section(s.section)}`,
					range(s.year),
					range(s.isbA),
					range(s.isbB),
				]),
				[
					text.total,
					range(r.total.year),
					range(r.total.isbA),
					range(r.total.isbB),
				],
			],
		},
	];
	view.sections.forEach(({ section, rows }, i) => {
		blocks.push({
			type: "heading",
			level: 2,
			text: `${i + 1}. ${labels.section(section)}`,
		});
		blocks.push({
			type: "table",
			columns: [
				{ label: text.colItem, width: 34 },
				{ label: text.colCadence, width: 18 },
				{ label: text.colYear, width: 10 },
				{ label: text.colIsbA, width: 9 },
				{ label: text.colIsbB, width: 9 },
				{ label: text.colStatus, width: 20 },
			],
			rows: rows.map((row) => {
				const { item, numbers: n, off } = row;
				const dash = "–";
				return [
					`${row.depth > 0 ? "– " : ""}${item.title}`,
					plain(labels.cadence(item)),
					off ? dash : range(n.year),
					off ? dash : range(n.isbA),
					off ? dash : range(n.isbB),
					off
						? plain(labels.statusText(row))
						: `${labels.state(row)}: ${plain(labels.statusText(row))}`,
				];
			}),
			empty: text.empty,
		});
	});
	blocks.push({ type: "paragraph", text: text.source, muted: true });
	return blocks;
}
