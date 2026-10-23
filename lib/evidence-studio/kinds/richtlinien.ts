import { desc, eq } from "drizzle-orm";
import { documents, documentVersions } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import {
	CLASSIFICATION,
	DOC_STATUS,
	DOC_TYPE,
	label,
} from "./doc-audit-labels";

// NW-RICHTLINIEN: Verzeichnis der Richtlinien und Dokumente mit Versionen
// (ISO 27001 5.2, 7.5.3)
export type RichtlinienFacts = {
	documents: {
		docNumber: string;
		title: string;
		type: string;
		classification: string;
		status: string;
		version: string;
		effectiveFrom: string | null;
		owner: string | null;
		reviewCycleMonths: number;
		nextReviewAt: string | null;
		isoMandatory: boolean;
		versions: {
			version: string;
			changeSummary: string;
			approvedBy: string | null;
			approvedAt: string | null;
			publishedAt: string | null;
		}[];
	}[];
};

// Versionshistorie je Dokument: die letzten fünf
const HISTORY = 5;

export function buildRichtlinien(f: RichtlinienFacts, ctx: { today: string }) {
	const current = f.documents.filter(
		(d) => d.status !== "retired" && d.status !== "superseded",
	);
	const valid = current.filter(
		(d) => d.status === "approved" || d.status === "published",
	);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Dokumente im Verzeichnis", String(current.length)],
				["freigegeben oder veröffentlicht", String(valid.length)],
				[
					"Pflichtdokumente (ISO 27001)",
					String(current.filter((d) => d.isoMandatory).length),
				],
				[
					"Prüfung überfällig",
					String(
						valid.filter((d) => d.nextReviewAt && d.nextReviewAt < ctx.today)
							.length,
					),
				],
				[
					"außer Kraft oder ersetzt",
					String(f.documents.length - current.length),
				],
			],
		},
		{ type: "heading", level: 1, text: "Verzeichnis" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 9 },
				{ label: "Titel", width: 30 },
				{ label: "Typ / Klasse", width: 15 },
				{ label: "Version", width: 8 },
				{ label: "Status", width: 12 },
				{ label: "Verantwortlich", width: 15 },
				{ label: "nächste Prüfung", width: 12 },
			],
			rows: current.map((d) => [
				d.docNumber,
				`${d.title}${d.isoMandatory ? " (Pflicht)" : ""}`,
				`${label(DOC_TYPE, d.type)}\n${label(CLASSIFICATION, d.classification)}`,
				d.version,
				`${label(DOC_STATUS, d.status)}${d.effectiveFrom ? `\nab ${fmtDay(d.effectiveFrom)}` : ""}`,
				d.owner ?? "—",
				`${fmtDay(d.nextReviewAt)}\n(${d.reviewCycleMonths} Monate)`,
			]),
			empty: "Noch keine Dokumente erfasst.",
		},
	];
	const withHistory = valid.filter((d) => d.versions.length > 0);
	if (withHistory.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Versionshistorie" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 9 },
					{ label: "Version", width: 8 },
					{ label: "Änderung", width: 38 },
					{ label: "Freigabe", width: 22 },
					{ label: "veröffentlicht", width: 12 },
				],
				rows: withHistory.flatMap((d) =>
					d.versions
						.slice(0, HISTORY)
						.map((v) => [
							d.docNumber,
							v.version,
							v.changeSummary,
							v.approvedAt
								? `${fmtDay(v.approvedAt)}${v.approvedBy ? `\n${v.approvedBy}` : ""}`
								: "—",
							fmtDay(v.publishedAt),
						]),
				),
			},
		);
	if (f.documents.length > current.length)
		blocks.push(
			{ type: "heading", level: 2, text: "Außer Kraft oder ersetzt" },
			{
				type: "list",
				items: f.documents
					.filter((d) => !current.includes(d))
					.map(
						(d) =>
							`${d.docNumber} ${d.title} (Version ${d.version}, ${label(DOC_STATUS, d.status)})`,
					),
			},
		);
	return { blocks };
}

export const richtlinien = generator<RichtlinienFacts>({
	code: "NW-RICHTLINIEN",
	async load(tx, orgId) {
		const [docs, versions] = await Promise.all([
			tx
				.select({
					id: documents.id,
					docNumber: documents.docNumber,
					title: documents.title,
					type: documents.type,
					classification: documents.classification,
					status: documents.status,
					version: documents.version,
					effectiveFrom: documents.effectiveFrom,
					ownerUserId: documents.ownerUserId,
					reviewCycleMonths: documents.reviewCycleMonths,
					nextReviewAt: documents.nextReviewAt,
					isoMandatory: documents.isoMandatory,
				})
				.from(documents)
				.where(eq(documents.organizationId, orgId))
				.orderBy(documents.docNumber),
			tx
				.select({
					documentId: documentVersions.documentId,
					version: documentVersions.version,
					changeSummary: documentVersions.changeSummary,
					approvedByUserId: documentVersions.approvedByUserId,
					approvedAt: documentVersions.approvedAt,
					publishedAt: documentVersions.publishedAt,
				})
				.from(documentVersions)
				.where(eq(documentVersions.organizationId, orgId))
				.orderBy(desc(documentVersions.createdAt)),
		]);
		const names = await userNames(tx, [
			...docs.map((d) => d.ownerUserId),
			...versions.map((v) => v.approvedByUserId),
		]);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
		return {
			documents: docs.map((d) => ({
				docNumber: d.docNumber,
				title: d.title,
				type: d.type,
				classification: d.classification,
				status: d.status,
				version: d.version,
				effectiveFrom: d.effectiveFrom,
				owner: name(d.ownerUserId),
				reviewCycleMonths: d.reviewCycleMonths,
				nextReviewAt: d.nextReviewAt,
				isoMandatory: d.isoMandatory,
				versions: versions
					.filter((v) => v.documentId === d.id)
					.map((v) => ({
						version: v.version,
						changeSummary: v.changeSummary,
						approvedBy: name(v.approvedByUserId),
						approvedAt: day(v.approvedAt),
						publishedAt: day(v.publishedAt),
					})),
			})),
		};
	},
	build: buildRichtlinien,
});
