import { and, desc, eq } from "drizzle-orm";
import { managementReports } from "@/db/schema";
import type { ManagementReportKind, RoleFunction } from "@/db/schema/enums";
import { REPORT_KIND_BY_KEY } from "@/lib/compliance/catalog/management-reports";
import { asDigest } from "@/lib/compliance/management-review-digest";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-GL-BERICHT (je Bericht): Bericht einer Funktion an die
// Geschäftsleitung mit Einschätzung, Kennzahlen aus Klick (Schnappschuss
// beim Vorlegen) und vorgeschlagenen Maßnahmen. Die Geschäftsleitung nimmt
// ihn per Unterschrift zur Kenntnis (signPurpose acknowledge).
export type GlBerichtFacts = {
	kind: ManagementReportKind;
	title: string;
	periodFrom: string;
	periodTo: string;
	authorFunction: RoleFunction | null;
	author: string | null;
	submittedAt: string;
	summary: string | null;
	measures: string | null;
	sections: {
		title: string;
		facts: [string, string][];
		items: string[];
	}[];
};

export function buildGlBericht(f: GlBerichtFacts) {
	const def = REPORT_KIND_BY_KEY.get(f.kind);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Art", def?.title ?? f.kind],
				["Zeitraum", `${fmtDay(f.periodFrom)} – ${fmtDay(f.periodTo)}`],
				[
					"Berichtet von",
					[
						f.author,
						f.authorFunction ? `(${functionLabel(f.authorFunction)})` : null,
					]
						.filter(Boolean)
						.join(" ") || "—",
				],
				["Vorgelegt am", fmtDay(f.submittedAt)],
				["Grundlage", def?.legalBasis ?? "—"],
			],
		},
		{ type: "heading", level: 1, text: "Einschätzung" },
		{
			type: "paragraph",
			text: f.summary ?? "Keine Einschätzung eingetragen.",
			muted: !f.summary,
		},
	];
	if (f.sections.length > 0) {
		blocks.push({ type: "heading", level: 1, text: "Kennzahlen aus Klick" });
		for (const s of f.sections) {
			blocks.push(
				{ type: "heading", level: 2, text: s.title },
				{ type: "keyValue", items: s.facts },
			);
			if (s.items.length > 0) blocks.push({ type: "list", items: s.items });
		}
	}
	blocks.push(
		{ type: "heading", level: 1, text: "Vorgeschlagene Maßnahmen" },
		{
			type: "paragraph",
			text: f.measures ?? "Keine Maßnahmen vorgeschlagen.",
			muted: !f.measures,
		},
	);
	return {
		title: f.title,
		subtitle: def && def.title !== f.title ? def.title : undefined,
		blocks,
	};
}

export const glBericht = generator<GlBerichtFacts>({
	code: "NW-GL-BERICHT",
	async load(tx, orgId, entityId) {
		if (!entityId) return null;
		const [r] = await tx
			.select()
			.from(managementReports)
			.where(
				and(
					eq(managementReports.organizationId, orgId),
					eq(managementReports.id, entityId),
				),
			)
			.limit(1);
		// erst vorgelegte Berichte werden zum Nachweis
		if (!r || r.status !== "submitted" || !r.submittedAt) return null;
		const names = await userNames(tx, [r.authorUserId]);
		const digest = asDigest(r.figures);
		return {
			kind: r.kind,
			title: r.title,
			periodFrom: r.periodFrom,
			periodTo: r.periodTo,
			authorFunction: r.authorFunction,
			author: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
			submittedAt: r.submittedAt.toISOString().slice(0, 10),
			summary: r.summary,
			measures: r.measures,
			sections: (digest?.sections ?? []).map((s) => ({
				title: s.title,
				facts: s.facts.map((x) => [x.label, x.value] as [string, string]),
				items: s.items.map((i) =>
					i.note ? `${i.title} — ${i.note}` : i.title,
				),
			})),
		};
	},
	build: buildGlBericht,
	controls: (f) => ["CC-GOV-03", REPORT_KIND_BY_KEY.get(f.kind)?.control ?? ""],
	async entities(tx, orgId) {
		const rows = await tx
			.select({ id: managementReports.id, title: managementReports.title })
			.from(managementReports)
			.where(
				and(
					eq(managementReports.organizationId, orgId),
					eq(managementReports.status, "submitted"),
				),
			)
			.orderBy(desc(managementReports.periodTo));
		return rows.map((r) => ({ id: r.id, label: r.title }));
	},
});
