import {
	and,
	count,
	desc,
	eq,
	ilike,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { evidence } from "@/db/schema";
import type { EvidenceRow } from "@/lib/compliance/queries";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { currentEvidence } from "@/lib/evidence/current";
import { PAGE_SIZE, pageCount, pageWindow } from "@/lib/paging";

// Nachweis-Register seitenweise (Leistung bei wachsenden Daten): Filter,
// Suche und Zähler in SQL, geladen wird nur eine Seite und nur die Spalten
// der Liste (kein Schnappschuss, kein verfasster Inhalt).

export type EvidenceListRow = Pick<
	EvidenceRow,
	| "id"
	| "title"
	| "description"
	| "url"
	| "type"
	| "classification"
	| "fileName"
	| "source"
	| "dlp"
	| "validUntil"
	| "supersededAt"
	| "createdByUserId"
	| "createdAt"
> & { controlCodes: string[]; createdByName: string | null };

export type EvidenceRegisterFilter = {
	includeSuperseded: boolean;
	q?: string;
	type?: string;
	classification?: string;
	createdBy?: string;
	dlpOnly?: boolean;
	// darf streng geheime Titel durchsuchen (sonst nur die Maßnahmen)
	seesSecret: boolean;
	page: number;
};

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function pageEvidenceRegister(
	tx: OrgTx,
	orgId: string,
	f: EvidenceRegisterFilter,
): Promise<{ rows: EvidenceListRow[]; total: number; page: number }> {
	const q = f.q?.trim();
	const textMatch = q
		? or(
				f.seesSecret
					? or(
							ilike(evidence.title, like(q)),
							ilike(evidence.fileName, like(q)),
						)
					: and(
							ne(evidence.classification, "secret"),
							or(
								ilike(evidence.title, like(q)),
								ilike(evidence.fileName, like(q)),
							),
						),
				// Kürzel der verknüpften Maßnahmen
				sql`exists (select 1 from control_evidence ce
					join control_implementations ci on ci.id = ce.implementation_id
					join controls c on c.id = ci.control_id
					where ce.organization_id = ${orgId} and ce.evidence_id = ${evidence.id}
					  and c.code ilike ${like(q)})`,
			)
		: undefined;
	const where: SQL | undefined = and(
		eq(evidence.organizationId, orgId),
		f.includeSuperseded ? undefined : currentEvidence(),
		// Dateien von Dokumentfassungen gehören zum Dokument (/dokumente)
		ne(evidence.source, "document"),
		f.type ? eq(evidence.type, f.type as EvidenceRow["type"]) : undefined,
		f.classification
			? eq(
					evidence.classification,
					f.classification as EvidenceRow["classification"],
				)
			: undefined,
		f.createdBy ? eq(evidence.createdByUserId, f.createdBy) : undefined,
		// DLP-Treffer: eine Regel hat gegriffen und es gab Funde
		f.dlpOnly
			? sql`${evidence.dlp}->>'action' <> 'allow' and jsonb_path_exists(${evidence.dlp}, '$.findings[*] ? (@.count > 0)')`
			: undefined,
		textMatch,
	);

	const [{ total }] = await tx
		.select({ total: count() })
		// evidence:any-version — Zählung mit demselben Filter wie die Liste
		.from(evidence)
		.where(where);
	const page = Math.min(f.page, pageCount(total));
	const { limit, offset } = pageWindow(page, PAGE_SIZE);
	const rows = await tx
		.select({
			id: evidence.id,
			title: evidence.title,
			description: evidence.description,
			url: evidence.url,
			type: evidence.type,
			classification: evidence.classification,
			fileName: evidence.fileName,
			source: evidence.source,
			dlp: evidence.dlp,
			validUntil: evidence.validUntil,
			supersededAt: evidence.supersededAt,
			createdByUserId: evidence.createdByUserId,
			createdAt: evidence.createdAt,
		})
		// evidence:any-version — Filter wie bei der Zählung (currentEvidence())
		.from(evidence)
		.where(where)
		.orderBy(desc(evidence.createdAt), desc(evidence.id))
		.limit(limit)
		.offset(offset);
	if (rows.length === 0) return { rows: [], total, page };

	const ids = rows.map((r) => r.id);
	const [links, names] = await Promise.all([
		tx.execute<{ evidence_id: string; code: string }>(sql`
			select ce.evidence_id, c.code
			from control_evidence ce
			join control_implementations ci on ci.id = ce.implementation_id
			join controls c on c.id = ci.control_id
			where ce.organization_id = ${orgId}
			  and ce.evidence_id in (${sql.join(
					ids.map((id) => sql`${id}::uuid`),
					sql`, `,
				)})`),
		userNames(
			tx,
			rows.map((r) => r.createdByUserId),
		),
	]);
	const byEvidence = new Map<string, string[]>();
	for (const l of links) {
		const list = byEvidence.get(l.evidence_id) ?? [];
		list.push(l.code);
		byEvidence.set(l.evidence_id, list);
	}
	return {
		total,
		page,
		rows: rows.map((r) => ({
			...r,
			controlCodes: (byEvidence.get(r.id) ?? []).sort(),
			createdByName: r.createdByUserId
				? (names.get(r.createdByUserId) ?? null)
				: null,
		})),
	};
}
