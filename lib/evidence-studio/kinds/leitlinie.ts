import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { documents, documentVersions, evidence } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import { currentVersionsByDocument } from "@/lib/documents/in-force";
import { inForceStatus } from "@/lib/documents/versions";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";

// NW-LEITLINIE: die freigegebene Leitlinie zur Informationssicherheit
// (ISO 27001 5.2) — Text der freigegebenen Fassung bzw. bei hochgeladener
// Datei deren Name und Prüfsumme. Unterschrieben wird der Nachweis.
export const LEITLINIE_TEMPLATE = "RL-ISMS-LEITLINIE";

export type LeitlinieFacts = {
	docNumber: string;
	title: string;
	status: string;
	version: string;
	approvedAt: string | null;
	approvedBy: string | null;
	effectiveFrom: string | null;
	nextReviewAt: string | null;
	body: string | null;
	file: { name: string | null; sha256: string | null } | null;
};

// Markdown der Leitlinie → Abschnitte (Überschriften, Listen, Absätze)
export function markdownBlocks(md: string): DocBlock[] {
	const out: DocBlock[] = [];
	let para: string[] = [];
	let list: string[] = [];
	const flush = () => {
		if (para.length > 0) out.push({ type: "paragraph", text: para.join(" ") });
		if (list.length > 0) out.push({ type: "list", items: list });
		para = [];
		list = [];
	};
	for (const raw of md.split(/\r?\n/)) {
		const line = raw.trim();
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			flush();
			const level = Math.min(3, Math.max(1, (h[1]?.length ?? 1) - 1)) as
				| 1
				| 2
				| 3;
			out.push({
				type: "heading",
				level,
				text: (h[2] ?? "").replace(/[*_`]/g, ""),
			});
			continue;
		}
		const li = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
		if (li) {
			if (para.length > 0) {
				out.push({ type: "paragraph", text: para.join(" ") });
				para = [];
			}
			list.push((li[1] ?? "").replace(/[*_`]/g, ""));
			continue;
		}
		if (line === "") {
			flush();
			continue;
		}
		if (list.length > 0) {
			out.push({ type: "list", items: list });
			list = [];
		}
		para.push(line.replace(/[*_`]/g, ""));
	}
	flush();
	return out;
}

const STATUS: Record<string, string> = {
	draft: "Entwurf",
	in_review: "in Prüfung",
	approved: "freigegeben",
	published: "veröffentlicht",
	retired: "zurückgezogen",
	superseded: "abgelöst",
};

export function buildLeitlinie(f: LeitlinieFacts) {
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Dokument", `${f.docNumber} ${f.title}`],
				["Fassung", f.version],
				["Status", STATUS[f.status] ?? f.status],
				[
					"Freigegeben",
					f.approvedAt
						? `${fmtDay(f.approvedAt)}${f.approvedBy ? ` durch ${f.approvedBy}` : ""}`
						: "noch nicht",
				],
				["Gültig ab", fmtDay(f.effectiveFrom)],
				["Nächste Überprüfung", fmtDay(f.nextReviewAt)],
			],
		},
	];
	if (f.body?.trim())
		blocks.push(
			{ type: "heading", level: 1, text: "Wortlaut der freigegebenen Fassung" },
			...markdownBlocks(f.body),
		);
	else if (f.file)
		blocks.push({
			type: "paragraph",
			text: `Inhalt: freigegebene Datei ${f.file.name ?? "(ohne Namen)"}, SHA-256 ${f.file.sha256 ?? "unbekannt"}.`,
		});
	else
		blocks.push({
			type: "paragraph",
			text: "Für diese Fassung ist kein Wortlaut hinterlegt.",
			muted: true,
		});
	return { title: f.title, blocks };
}

export const leitlinie = generator<LeitlinieFacts>({
	code: "NW-LEITLINIE",
	async load(tx, orgId) {
		// freigegebene bzw. veröffentlichte Leitlinie, sonst die jüngste
		const docs = await tx
			.select()
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, orgId),
					eq(documents.templateCode, LEITLINIE_TEMPLATE),
				),
			)
			.orderBy(desc(documents.updatedAt));
		// in Kraft (gültige Fassung) vor freigegeben vor Entwurf
		const current = await currentVersionsByDocument(tx, orgId);
		const doc =
			docs.find((d) => current.has(d.id)) ??
			docs.find((d) => d.status === "published" || d.status === "approved") ??
			docs.find((d) => d.status !== "retired" && d.status !== "superseded");
		if (!doc) return null;
		const cur = current.get(doc.id);
		const [version] = await tx
			.select()
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.documentId, doc.id),
					eq(documentVersions.organizationId, orgId),
					cur
						? eq(documentVersions.id, cur.id)
						: isNotNull(documentVersions.approvedAt),
				),
			)
			.orderBy(desc(documentVersions.approvedAt))
			.limit(1);
		const fileId = version?.fileEvidenceId ?? doc.fileEvidenceId;
		const [file] = fileId
			? await tx
					.select({ name: evidence.fileName, sha256: evidence.sha256 })
					// evidence:any-version — Datei der Leitlinie per ID
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							inArray(evidence.id, [fileId]),
						),
					)
					.limit(1)
			: [];
		const names = await userNames(tx, [version?.approvedByUserId]);
		return {
			docNumber: doc.docNumber,
			title: doc.title,
			status: inForceStatus(doc.status, Boolean(cur)),
			version: version?.version ?? doc.version,
			approvedAt: version?.approvedAt?.toISOString() ?? null,
			approvedBy: version?.approvedByUserId
				? (names.get(version.approvedByUserId) ?? null)
				: null,
			effectiveFrom: doc.effectiveFrom,
			nextReviewAt: doc.nextReviewAt,
			body: version ? version.bodyMarkdown : doc.bodyMarkdown,
			file: file ?? null,
		};
	},
	build: buildLeitlinie,
});
