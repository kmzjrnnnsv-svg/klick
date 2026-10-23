import { eq } from "drizzle-orm";
import { documents, orgSettings } from "@/db/schema";
import type { DocumentNumbering } from "@/db/schema/platform";
import { DEFAULT_PREFIXES, type DocType } from "@/lib/documents/numbering";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";
import { DOC_STATUS, DOC_TYPE, label } from "./doc-audit-labels";

// NW-DOKUMENTENLENKUNG: Regeln der Dokumentenlenkung (ISO 27001 7.5) —
// Nummernkreise, Lebenszyklus, Prüfzyklen und der Stand der Dokumente
export type DokumentenlenkungFacts = {
	prefixes: { type: string; prefix: string; next: number | null }[];
	documents: {
		docNumber: string;
		title: string;
		type: string;
		status: string;
		reviewCycleMonths: number;
		nextReviewAt: string | null;
		approverFunction: string | null;
	}[];
};

const LIFECYCLE: [string, string][] = [
	["Entwurf", "Erstellung und Überarbeitung durch die verantwortliche Person"],
	[
		"in Prüfung",
		"fachliche Prüfung; Freigabe durch die festgelegte Funktion (Vier-Augen)",
	],
	["freigegeben", "Inhalt freigegeben, Version festgeschrieben"],
	[
		"veröffentlicht",
		"gültig und verteilt; Kenntnisnahme laut Verteiler, Prüfung im festgelegten Zyklus",
	],
	[
		"außer Kraft / ersetzt",
		"nicht mehr gültig; frühere Versionen bleiben unverändert erhalten",
	],
];

export function buildDokumentenlenkung(
	f: DokumentenlenkungFacts,
	ctx: { today: string },
) {
	const active = f.documents.filter(
		(d) => d.status === "approved" || d.status === "published",
	);
	const overdue = active.filter(
		(d) => d.nextReviewAt && d.nextReviewAt < ctx.today,
	);
	const withoutReview = active.filter((d) => !d.nextReviewAt);
	const withoutApprover = f.documents.filter(
		(d) => !d.approverFunction && d.status !== "retired",
	);
	const byStatus = Object.keys(DOC_STATUS).map(
		(s) =>
			[
				label(DOC_STATUS, s),
				String(f.documents.filter((d) => d.status === s).length),
			] as [string, string],
	);
	const cycles = [...new Set(active.map((d) => d.reviewCycleMonths))].sort(
		(a, b) => a - b,
	);
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Dokumentierte Information wird in Klick gelenkt: Jedes Dokument erhält eine eindeutige Nummer aus dem Nummernkreis seines Typs, eine Version, eine verantwortliche Person, eine Freigabestelle, eine Klassifizierung und einen Prüfzyklus. Änderungen erzeugen eine neue Version; freigegebene Versionen werden nicht überschrieben.",
		},
		{ type: "heading", level: 1, text: "Nummernkreise" },
		{
			type: "table",
			columns: [
				{ label: "Dokumenttyp", width: 30 },
				{ label: "Präfix", width: 12 },
				{ label: "Beispiel", width: 16 },
				{ label: "Nächste Nummer", width: 14 },
			],
			rows: f.prefixes.map((p) => [
				label(DOC_TYPE, p.type),
				p.prefix,
				`${p.prefix}-001`,
				p.next === null
					? "—"
					: `${p.prefix}-${String(p.next).padStart(3, "0")}`,
			]),
		},
		{ type: "heading", level: 1, text: "Lebenszyklus" },
		{
			type: "table",
			columns: [
				{ label: "Status", width: 20 },
				{ label: "Bedeutung", width: 60 },
			],
			rows: LIFECYCLE.map(([a, b]) => [a, b]),
		},
		{ type: "heading", level: 1, text: "Stand der Dokumente" },
		{
			type: "keyValue",
			items: [
				["Dokumente gesamt", String(f.documents.length)],
				...byStatus,
				["Prüfzyklen in Gebrauch (Monate)", cycles.join(", ") || "—"],
				["Prüfung überfällig", String(overdue.length)],
				["ohne Prüftermin", String(withoutReview.length)],
				["ohne Freigabestelle", String(withoutApprover.length)],
			],
		},
	];
	if (overdue.length > 0)
		blocks.push(
			{ type: "heading", level: 2, text: "Überfällige Prüfungen" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 10 },
					{ label: "Dokument", width: 40 },
					{ label: "Prüfzyklus", width: 12 },
					{ label: "fällig seit", width: 14 },
				],
				rows: overdue.map((d) => [
					d.docNumber,
					d.title,
					`${d.reviewCycleMonths} Monate`,
					fmtDay(d.nextReviewAt),
				]),
			},
		);
	if (withoutApprover.length > 0)
		blocks.push({
			type: "paragraph",
			muted: true,
			text: `Ohne festgelegte Freigabestelle: ${withoutApprover.map((d) => d.docNumber).join(", ")}.`,
		});
	const approvers = [
		...new Set(
			f.documents
				.map((d) => d.approverFunction)
				.filter((x): x is string => Boolean(x)),
		),
	];
	if (approvers.length > 0)
		blocks.push({
			type: "paragraph",
			text: `Freigabestellen: ${approvers.map(functionLabel).join(", ")}.`,
		});
	return { blocks };
}

export const dokumentenlenkung = generator<DokumentenlenkungFacts>({
	code: "NW-DOKUMENTENLENKUNG",
	async load(tx, orgId) {
		const [settings] = await tx
			.select({ numbering: orgSettings.documentNumbering })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1);
		const numbering: DocumentNumbering = settings?.numbering ?? {};
		const rows = await tx
			.select({
				docNumber: documents.docNumber,
				title: documents.title,
				type: documents.type,
				status: documents.status,
				reviewCycleMonths: documents.reviewCycleMonths,
				nextReviewAt: documents.nextReviewAt,
				approverFunction: documents.approverFunction,
			})
			.from(documents)
			.where(eq(documents.organizationId, orgId))
			.orderBy(documents.docNumber);
		return {
			prefixes: (Object.keys(DEFAULT_PREFIXES) as DocType[]).map((type) => ({
				type,
				prefix: numbering[type]?.prefix ?? DEFAULT_PREFIXES[type],
				next: numbering[type]?.next ?? null,
			})),
			documents: rows,
		};
	},
	build: buildDokumentenlenkung,
});
