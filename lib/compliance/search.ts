import { sql } from "drizzle-orm";
import type { OrgTx } from "@/lib/db/with-org";

// Volltextsuche über Titel/Beschreibung/Kommentare (Postgres tsvector,
// Konfiguration „german"). Läuft in readOrg → RLS begrenzt auf die Org.
// Dokumente mit Klassifizierung „secret" werden nur über Titel/Nummer
// gefunden, nie über den Inhalt. Sensible Register (Verdachtsmeldungen,
// Hinweise, Beschwerden, Gesellschafter) sind bewusst nicht indexiert.

export type SearchHit = {
	kind:
		| "control"
		| "risk"
		| "document"
		| "process"
		| "provider"
		| "asset"
		| "incident"
		| "task"
		| "nonconformity"
		| "comment";
	id: string;
	code: string | null;
	title: string;
	snippet: string | null;
	rank: number;
	// Kommentare: Entität, an der der Kommentar hängt
	entityType: string | null;
	entityId: string | null;
};

const LIMIT = 60;

export async function searchOrg(
	tx: OrgTx,
	orgId: string,
	term: string,
): Promise<SearchHit[]> {
	const q = term.trim().slice(0, 200);
	if (q.length < 2) return [];
	const rows = await tx.execute<SearchHit>(sql`
		with q as (select websearch_to_tsquery('german', ${q}) as tsq)
		select * from (
			select 'control' as kind, ci.id::text as id, c.code as code, c.title as title,
				left(c.description, 200) as snippet,
				ts_rank(to_tsvector('german', c.code || ' ' || c.title || ' ' || coalesce(c.description, '')), q.tsq) as rank,
				null::text as entity_type, null::text as entity_id
			from control_implementations ci
			join controls c on c.id = ci.control_id, q
			where ci.organization_id = ${orgId}
				and to_tsvector('german', c.code || ' ' || c.title || ' ' || coalesce(c.description, '')) @@ q.tsq
			union all
			select 'risk', r.id::text, r.code, r.title, left(coalesce(r.description, ''), 200),
				ts_rank(to_tsvector('german', r.code || ' ' || r.title || ' ' || coalesce(r.description, '')), q.tsq),
				null, null
			from risks r, q
			where r.organization_id = ${orgId}
				and to_tsvector('german', r.code || ' ' || r.title || ' ' || coalesce(r.description, '')) @@ q.tsq
			union all
			select 'document', d.id::text, d.doc_number, d.title,
				case when d.classification = 'secret' then null else left(coalesce(d.body_markdown, ''), 200) end,
				ts_rank(to_tsvector('german', d.doc_number || ' ' || d.title || ' ' ||
					case when d.classification = 'secret' then '' else coalesce(d.body_markdown, '') end), q.tsq),
				null, null
			from documents d, q
			where d.organization_id = ${orgId}
				and to_tsvector('german', d.doc_number || ' ' || d.title || ' ' ||
					case when d.classification = 'secret' then '' else coalesce(d.body_markdown, '') end) @@ q.tsq
			union all
			select 'process', p.id::text, p.code, p.name, left(coalesce(p.description, ''), 200),
				ts_rank(to_tsvector('german', p.code || ' ' || p.name || ' ' || coalesce(p.description, '')), q.tsq),
				null, null
			from processes p, q
			where p.organization_id = ${orgId}
				and to_tsvector('german', p.code || ' ' || p.name || ' ' || coalesce(p.description, '')) @@ q.tsq
			union all
			select 'provider', v.id::text, null, v.name, left(coalesce(v.service_description, ''), 200),
				ts_rank(to_tsvector('german', v.name || ' ' || coalesce(v.service_description, '') || ' ' || coalesce(v.notes, '')), q.tsq),
				null, null
			from providers v, q
			where v.organization_id = ${orgId}
				and to_tsvector('german', v.name || ' ' || coalesce(v.service_description, '') || ' ' || coalesce(v.notes, '')) @@ q.tsq
			union all
			select 'asset', a.id::text, null, a.name, left(coalesce(a.description, ''), 200),
				ts_rank(to_tsvector('german', a.name || ' ' || coalesce(a.description, '') || ' ' || coalesce(a.location, '')), q.tsq),
				null, null
			from assets a, q
			where a.organization_id = ${orgId}
				and to_tsvector('german', a.name || ' ' || coalesce(a.description, '') || ' ' || coalesce(a.location, '')) @@ q.tsq
			union all
			select 'incident', i.id::text, i.code, i.title, left(coalesce(i.description, ''), 200),
				ts_rank(to_tsvector('german', i.code || ' ' || i.title || ' ' || coalesce(i.description, '')), q.tsq),
				null, null
			from incidents i, q
			where i.organization_id = ${orgId}
				and to_tsvector('german', i.code || ' ' || i.title || ' ' || coalesce(i.description, '')) @@ q.tsq
			union all
			select 'task', t.id::text, null, t.title, left(coalesce(t.description, ''), 200),
				ts_rank(to_tsvector('german', t.title || ' ' || coalesce(t.description, '')), q.tsq),
				t.entity_type, t.entity_id::text
			from tasks t, q
			where t.organization_id = ${orgId}
				and to_tsvector('german', t.title || ' ' || coalesce(t.description, '')) @@ q.tsq
			union all
			select 'nonconformity', n.id::text, n.code, n.title, left(coalesce(n.description, ''), 200),
				ts_rank(to_tsvector('german', n.code || ' ' || n.title || ' ' || coalesce(n.description, '')), q.tsq),
				null, null
			from nonconformities n, q
			where n.organization_id = ${orgId}
				and to_tsvector('german', n.code || ' ' || n.title || ' ' || coalesce(n.description, '')) @@ q.tsq
			union all
			select 'comment', cm.id::text, null, left(cm.body_markdown, 120), left(cm.body_markdown, 200),
				ts_rank(to_tsvector('german', cm.body_markdown), q.tsq),
				cm.entity_type, cm.entity_id::text
			from comments cm, q
			where cm.organization_id = ${orgId}
				and to_tsvector('german', cm.body_markdown) @@ q.tsq
		) hits
		order by rank desc, title asc
		limit ${LIMIT}
	`);
	return (rows as unknown as Record<string, unknown>[]).map((r) => ({
		kind: r.kind as SearchHit["kind"],
		id: String(r.id),
		code: (r.code as string | null) ?? null,
		title: String(r.title),
		snippet: (r.snippet as string | null) ?? null,
		rank: Number(r.rank),
		entityType: (r.entity_type as string | null) ?? null,
		entityId: (r.entity_id as string | null) ?? null,
	}));
}
