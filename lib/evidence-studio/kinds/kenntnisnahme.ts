import { eq, inArray } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	documentAcknowledgements,
	documents,
	documentVersions,
} from "@/db/schema";
import { normalizeRole } from "@/lib/auth/session-rules";
import { currentVersionsByDocument } from "@/lib/documents/in-force";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import { label, pct, ROLE } from "./doc-audit-labels";

// NW-KENNTNISNAHME: Kenntnisnahme-Quote je veröffentlichtem Dokument
// (ISO 27001 7.3, 7.4, 5.2) — Nenner ist der Verteiler (Rollen laut
// documents.distribution, leer = alle Mitglieder), wie im Tick
export type KenntnisnahmeFacts = {
	documents: {
		docNumber: string;
		title: string;
		version: string;
		publishedAt: string | null;
		distribution: string[];
		audience: { name: string; acknowledgedAt: string | null }[];
	}[];
};

export function buildKenntnisnahme(f: KenntnisnahmeFacts) {
	const total = f.documents.reduce((a, d) => a + d.audience.length, 0);
	const done = f.documents.reduce(
		(a, d) => a + d.audience.filter((p) => p.acknowledgedAt).length,
		0,
	);
	const missing = f.documents
		.map((d) => ({
			d,
			names: d.audience.filter((p) => !p.acknowledgedAt).map((p) => p.name),
		}))
		.filter((x) => x.names.length > 0);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["veröffentlichte Dokumente mit Verteiler", String(f.documents.length)],
				["erforderliche Kenntnisnahmen", String(total)],
				["bestätigt", String(done)],
				["Quote gesamt", pct(done, total)],
			],
		},
		{ type: "heading", level: 1, text: "Quote je Dokument" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 9 },
				{ label: "Dokument", width: 32 },
				{ label: "Version", width: 8 },
				{ label: "veröffentlicht", width: 12 },
				{ label: "Verteiler", width: 16 },
				{ label: "bestätigt", width: 10 },
				{ label: "Quote", width: 8 },
			],
			rows: f.documents.map((d) => {
				const ok = d.audience.filter((p) => p.acknowledgedAt).length;
				return [
					d.docNumber,
					d.title,
					d.version,
					fmtDay(d.publishedAt),
					d.distribution.length === 0
						? label(ROLE, "all")
						: d.distribution.map((r) => label(ROLE, r)).join(", "),
					`${ok} / ${d.audience.length}`,
					pct(ok, d.audience.length),
				];
			}),
			empty: "Keine veröffentlichten Dokumente.",
		},
	];
	if (missing.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Ausstehende Kenntnisnahmen" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 10 },
					{ label: "Dokument", width: 30 },
					{ label: "noch nicht bestätigt", width: 50 },
				],
				rows: missing.map(({ d, names }) => [
					d.docNumber,
					d.title,
					names.join(", "),
				]),
			},
		);
	else if (f.documents.length > 0)
		blocks.push({
			type: "paragraph",
			text: "Alle Personen im Verteiler haben die aktuelle Version aller veröffentlichten Dokumente zur Kenntnis genommen.",
		});
	return { blocks };
}

export const kenntnisnahme = generator<KenntnisnahmeFacts>({
	code: "NW-KENNTNISNAHME",
	async load(tx, orgId) {
		const allDocs = await tx
			.select({
				id: documents.id,
				docNumber: documents.docNumber,
				title: documents.title,
				version: documents.version,
				distribution: documents.distribution,
			})
			.from(documents)
			.where(eq(documents.organizationId, orgId))
			.orderBy(documents.docNumber);
		// Kenntnisnahme gilt der gültigen Fassung (auch während eine neue
		// Fassung in Arbeit ist)
		const current = await currentVersionsByDocument(tx, orgId);
		const docs = allDocs
			.filter((d) => current.has(d.id))
			.map((d) => ({ ...d, version: current.get(d.id)?.version ?? d.version }));
		if (docs.length === 0) return { documents: [] };
		const [versions, acks, members] = await Promise.all([
			tx
				.select({
					id: documentVersions.id,
					documentId: documentVersions.documentId,
					version: documentVersions.version,
					publishedAt: documentVersions.publishedAt,
				})
				.from(documentVersions)
				.where(
					inArray(
						documentVersions.documentId,
						docs.map((d) => d.id),
					),
				),
			tx
				.select({
					versionId: documentAcknowledgements.documentVersionId,
					userId: documentAcknowledgements.userId,
					acknowledgedAt: documentAcknowledgements.acknowledgedAt,
				})
				.from(documentAcknowledgements)
				.where(eq(documentAcknowledgements.organizationId, orgId)),
			tx
				.select({
					userId: member.userId,
					role: member.role,
					name: user.name,
					email: user.email,
				})
				.from(member)
				.innerJoin(user, eq(user.id, member.userId))
				.where(eq(member.organizationId, orgId)),
		]);
		return {
			documents: docs.flatMap((d) => {
				const v = versions.find(
					(x) => x.documentId === d.id && x.version === d.version,
				);
				if (!v) return [];
				const audience = members
					.filter((m) => {
						const role = normalizeRole(m.role);
						return (
							d.distribution.length === 0 ||
							d.distribution.includes("all") ||
							d.distribution.includes(role)
						);
					})
					.map((m) => {
						const ack = acks.find(
							(a) => a.versionId === v.id && a.userId === m.userId,
						);
						return {
							name: m.name.trim() || m.email,
							acknowledgedAt: ack
								? ack.acknowledgedAt.toISOString().slice(0, 10)
								: null,
						};
					})
					.sort((a, b) => a.name.localeCompare(b.name, "de"));
				return [
					{
						docNumber: d.docNumber,
						title: d.title,
						version: d.version,
						publishedAt: v.publishedAt
							? v.publishedAt.toISOString().slice(0, 10)
							: null,
						distribution: d.distribution,
						audience,
					},
				];
			}),
		};
	},
	build: buildKenntnisnahme,
});
