// Messdaten in Menge (scripts/qa/perf.ts): füllt eine bestehende Org einer
// Mess- oder Test-Datenbank mit vielen Datensätzen, damit sich zeigt, ob eine
// Seite mit der Datenmenge langsamer wird. Klont vorhandene Zeilen der Org
// (gültige Werte je Spalte) und hängt Protokolleinträge mit echter
// Prüfsummen-Kette an. Nur gegen Datenbanken mit Namen *_perf oder *_test.
//
//   PERF_DATABASE_URL=postgres://postgres:…@localhost:5432/klick_perf \
//     pnpm exec tsx scripts/qa/seed-volume.ts --org qa-org-82629 [--scale 1]
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { computeAuditHash } from "../../lib/audit-hash";

const url = process.env.PERF_DATABASE_URL;
if (!url) throw new Error("PERF_DATABASE_URL fehlt");
const dbName = new URL(url).pathname.slice(1);
if (!/_(perf|test)$/.test(dbName))
	throw new Error(
		`Nur Mess- oder Test-Datenbanken (*_perf, *_test), nicht „${dbName}“`,
	);

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const slug = arg("org");
if (!slug) throw new Error("--org <kurzname> fehlt");
const scale = Number(arg("scale") ?? "1");

const TARGET = {
	audit: 100_000,
	notifications: 50_000,
	evidence: 10_000,
	tasks: 5_000,
	risks: 2_000,
	documents: 1_000,
	providers: 500,
	comments: 2_000,
	assets: 1_000,
	incidents: 200,
};

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function columns(table: string): Promise<string[]> {
	const rows = await sql<{ column_name: string }[]>`
		select column_name from information_schema.columns
		where table_schema = 'public' and table_name = ${table}
		  and is_generated = 'NEVER'
		order by ordinal_position`;
	return rows.map((r) => r.column_name);
}

// Klont die Zeilen der Org, bis `target` neue Zeilen da sind. `overrides`
// ersetzt Spalten durch SQL-Ausdrücke (t = Vorlage, g = Nummer der Kopie).
async function cloneRows(
	table: string,
	orgId: string,
	target: number,
	overrides: Record<string, string>,
): Promise<number> {
	const [{ n }] = await sql<{ n: number }[]>`
		select count(*)::int as n from ${sql(table)} where organization_id = ${orgId}`;
	if (n === 0) {
		console.log(`  ${table}: keine Vorlage in der Org, übersprungen`);
		return 0;
	}
	const copies = Math.ceil((target * scale) / n);
	const cols = await columns(table);
	const exprs = cols.map((c) => overrides[c] ?? `t.${c}`);
	const res = await sql.unsafe(
		`insert into ${table} (${cols.join(", ")})
		 select ${exprs.join(", ")}
		 from (select * from ${table} where organization_id = $1) t,
		      generate_series(1, $2) g
		 limit $3`,
		[orgId, copies, Math.round(target * scale)],
	);
	console.log(`  ${table}: +${res.count}`);
	return res.count;
}

const created = (days: number) =>
	`now() - (random() * interval '${days} days')`;

async function main() {
	const [org] = await sql<{ id: string }[]>`
		select id from organization where slug = ${slug}`;
	if (!org) throw new Error(`Org „${slug}“ nicht gefunden`);
	const orgId = org.id;
	const users = await sql<{ id: string }[]>`
		select user_id as id from member where organization_id = ${orgId}`;
	const userIds = users.map((u) => u.id);
	if (userIds.length === 0) throw new Error("Org ohne Mitglieder");
	console.log(
		`Org ${slug} (${orgId}), ${userIds.length} Mitglieder, Faktor ${scale}`,
	);

	const tag = `PERF-${Date.now().toString(36).toUpperCase()}`;
	const uniq = (col: string) =>
		`t.${col} || '-${tag}-' || g || '-' || substr(md5(random()::text), 1, 6)`;
	const id = "gen_random_uuid()";
	const at = created(730);

	await cloneRows("tasks", orgId, TARGET.tasks, {
		id,
		title: `t.title || ' (${tag} ' || g || ')'`,
		created_at: at,
		updated_at: "now()",
	});
	await cloneRows("risks", orgId, TARGET.risks, {
		id,
		code: uniq("code"),
		title: `t.title || ' ' || g`,
		created_at: at,
		updated_at: "now()",
	});
	await cloneRows("assets", orgId, TARGET.assets, {
		id,
		name: `t.name || ' ' || g`,
		created_at: at,
		updated_at: "now()",
	});
	await cloneRows("incidents", orgId, TARGET.incidents, {
		id,
		code: uniq("code"),
		title: `t.title || ' ' || g`,
		created_at: at,
		updated_at: "now()",
	});
	await cloneRows("providers", orgId, TARGET.providers, {
		id,
		name: `t.name || ' ' || g`,
		created_at: at,
		updated_at: "now()",
	});

	// Dokumente und je zwei Fassungen
	const docCount = await cloneRows("documents", orgId, TARGET.documents, {
		id,
		doc_number: uniq("doc_number"),
		title: `t.title || ' ' || g`,
		created_at: at,
		updated_at: "now()",
	});
	if (docCount > 0) {
		const vcols = await columns("document_versions");
		const [tpl] = await sql<{ id: string }[]>`
			select id from document_versions where organization_id = ${orgId} limit 1`;
		if (tpl) {
			const exprs = vcols.map((c) =>
				c === "id"
					? "gen_random_uuid()"
					: c === "document_id"
						? "d.id"
						: c === "version"
							? "v.n || '.0'"
							: c === "organization_id"
								? "d.organization_id"
								: `t.${c}`,
			);
			const res = await sql.unsafe(
				`insert into document_versions (${vcols.join(", ")})
				 select ${exprs.join(", ")}
				 from documents d
				 cross join (select * from document_versions where id = $1) t
				 cross join (values (1), (2)) v(n)
				 where d.organization_id = $2 and d.doc_number like $3`,
				[tpl.id, orgId, `%${tag}%`],
			);
			console.log(`  document_versions: +${res.count}`);
		}
	}

	// Nachweise, je einer Maßnahme zugeordnet
	await cloneRows("evidence", orgId, TARGET.evidence, {
		id,
		title: `t.title || ' ' || g`,
		created_at: at,
		superseded_at: "null",
		superseded_by_id: "null",
		supersedes_id: "null",
	});
	const link = await sql`
		insert into control_evidence (organization_id, implementation_id, evidence_id)
		select e.organization_id, ci.id, e.id
		from (select id, organization_id, row_number() over () as rn
		      from evidence e
		      where e.organization_id = ${orgId}
		        and not exists (select 1 from control_evidence x where x.evidence_id = e.id)) e
		join (select id, row_number() over () - 1 as rn, count(*) over () as cnt
		      from control_implementations where organization_id = ${orgId}) ci
		  on ci.rn = e.rn % ci.cnt
		on conflict do nothing`;
	console.log(`  control_evidence: +${link.count}`);

	// Benachrichtigungen: verteilt auf alle Mitglieder, ein Drittel ungelesen
	await cloneRows("notifications", orgId, TARGET.notifications, {
		id,
		user_id: `(array[${userIds.map((u) => `'${u}'::uuid`).join(",")}])[1 + (g % ${userIds.length})]`,
		created_at: at,
		read_at: `case when g % 3 = 0 then null else now() end`,
	});

	// Kommentare an Aufgaben
	const comments = await sql`
		insert into comments (organization_id, entity_type, entity_id, body_markdown, author_user_id, created_at)
		select ${orgId}, 'task', t.id, 'Kommentar ' || g, ${userIds[0]}, now() - (random() * interval '365 days')
		from (select id from tasks where organization_id = ${orgId} order by random() limit ${Math.round(TARGET.comments * scale)}) t,
		     generate_series(1, 1) g`;
	console.log(`  comments: +${comments.count}`);

	// Protokoll mit gültiger Kette, angehängt an den Kopf der Org
	const [head] = await sql<{ hash: string }[]>`
		select hash from audit_log where organization_id = ${orgId} order by seq desc limit 1`;
	const taskIds = (
		await sql<{ id: string }[]>`
			select id from tasks where organization_id = ${orgId} limit 2000`
	).map((r) => r.id);
	let prev: string | null = head?.hash ?? null;
	const total = Math.round(TARGET.audit * scale);
	const start = Date.now() - 730 * 86_400_000;
	const step = (730 * 86_400_000) / total;
	const actions = [
		"task.updated",
		"task.created",
		"control.status_changed",
		"risk.updated",
		"evidence.uploaded",
		"document.updated",
	];
	for (let off = 0; off < total; off += 2000) {
		const batch = [];
		for (let i = off; i < Math.min(total, off + 2000); i++) {
			const row = {
				id: randomUUID(),
				organizationId: orgId,
				actorUserId: userIds[i % userIds.length],
				action: actions[i % actions.length],
				target: `task:${taskIds[i % taskIds.length]}`,
				before: { status: "open" },
				after: { status: "in_progress", n: i },
				ip: null,
				userAgent: null,
				outcome: "success" as const,
				at: new Date(start + i * step),
			};
			const hash = computeAuditHash(prev, row);
			batch.push({
				id: row.id,
				organization_id: orgId,
				actor_user_id: row.actorUserId,
				action: row.action,
				target: row.target,
				before: row.before,
				after: row.after,
				ip: null,
				user_agent: null,
				outcome: row.outcome,
				prev_hash: prev,
				hash,
				at: row.at,
			});
			prev = hash;
		}
		await sql`insert into audit_log ${sql(batch)}`;
		if (off % 20_000 === 0)
			process.stdout.write(`  audit_log: ${off + batch.length}\r`);
	}
	console.log(`  audit_log: +${total}            `);

	await sql`analyze`;
	console.log("ANALYZE fertig");
}

main()
	.then(() => sql.end())
	.catch(async (e) => {
		console.error(e);
		await sql.end();
		process.exit(1);
	});
