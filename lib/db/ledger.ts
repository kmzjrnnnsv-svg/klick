import { and, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { auditLog, ledgerAnchors, ledgerHeads } from "@/db/schema";
import type { LedgerAnchor } from "@/db/schema/ledger";
import { CRITICAL_PREFIXES } from "@/lib/ledger/anchor";

// Verlauf mit Bitcoin-Anker (Härtung V): Lesen der Kettenköpfe aller Orgs und
// Schreiben der Anker im Plattform-Scope. Nur für lib/ledger/service.ts (Job)
// — die Köpfe sind Hashes ohne Inhalte, daher ohne Eintrag platform.access.
// Orgs lesen ihre eigenen Köpfe über orgLedger (Org-Kontext, RLS).

async function platform<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

export type ChainHead = {
	// null = Plattform-Kette
	orgId: string | null;
	seq: string;
	count: number;
	head: string;
};

/** Letzter Eintrag und Anzahl je Kette (bestehende Orgs + Plattform).
 * Läuft alle 10 min (ledger-anchor): der Kopf kommt über den Index
 * (organization_id, seq), die Anzahl baut auf dem zuletzt verankerten Kopf
 * auf (ledger_heads bzw. ledger_anchors.platform) und zählt nur die Einträge
 * danach — vorher zählte jeder Lauf das ganze Protokoll (P3). Die Kette ist
 * nur anhängend, also bleibt die alte Anzahl gültig. */
export function chainHeads(): Promise<ChainHead[]> {
	return platform(async (tx) => {
		type Row = {
			organization_id: string | null;
			seq: string;
			hash: string;
			n: string;
		};
		const orgs = await tx.execute<Row>(sql`
			select o.id as organization_id, h.seq::text as seq, h.hash,
				(coalesce(p.count, 0) + c.n)::text as n
			from organization o
			cross join lateral (
				select a.seq, a.hash from audit_log a
				where a.organization_id = o.id
				order by a.seq desc limit 1
			) h
			left join lateral (
				select lh.seq, lh.count from ledger_heads lh
				where lh.organization_id = o.id
				order by lh.created_at desc limit 1
			) p on true
			cross join lateral (
				select count(*) as n from audit_log a
				where a.organization_id = o.id and a.seq > coalesce(p.seq, 0)
			) c`);
		const plat = await tx.execute<Row>(sql`
			select null::uuid as organization_id, h.seq::text as seq, h.hash,
				(coalesce((p.platform->>'count')::bigint, 0) + c.n)::text as n
			from (
				select a.seq, a.hash from audit_log a
				where a.organization_id is null
				order by a.seq desc limit 1
			) h
			left join lateral (
				select la.platform from ledger_anchors la
				where la.platform is not null
				order by la.created_at desc limit 1
			) p on true
			cross join lateral (
				select count(*) as n from audit_log a
				where a.organization_id is null
					and a.seq > coalesce((p.platform->>'seq')::bigint, 0)
			) c`);
		return [...plat, ...orgs].map((r) => ({
			orgId: r.organization_id,
			seq: r.seq,
			count: Number(r.n),
			head: r.hash,
		}));
	});
}

/** Kritische Einträge (Zugriffe durch Klick, Sicherheitsänderungen …) seit. */
export function criticalSince(since: Date | null): Promise<number> {
	return platform(async (tx) => {
		const [r] = await tx
			.select({ n: sql<number>`count(*)::int` })
			.from(auditLog)
			.where(
				and(
					or(
						...CRITICAL_PREFIXES.map(
							(p) => sql`${auditLog.action} like ${`${p}%`}`,
						),
					),
					since ? gt(auditLog.at, since) : undefined,
				),
			);
		return r?.n ?? 0;
	});
}

export async function latestAnchor(opts: {
	successful?: boolean;
	reason?: string;
}): Promise<LedgerAnchor | null> {
	const [row] = await globalDb
		.select()
		.from(ledgerAnchors)
		.where(
			and(
				opts.successful ? ne(ledgerAnchors.status, "failed") : undefined,
				opts.reason ? eq(ledgerAnchors.reason, opts.reason) : undefined,
			),
		)
		.orderBy(desc(ledgerAnchors.createdAt))
		.limit(1);
	return row ?? null;
}

export type NewHead = {
	orgId: string;
	seq: string;
	count: number;
	head: string;
	leaf: string;
	path: { side: "left" | "right"; hash: string }[];
};

/** Anker und Köpfe in einer Transaktion (Köpfe = Org-Tabelle, Plattform-Scope). */
export function insertAnchor(
	anchor: Omit<typeof ledgerAnchors.$inferInsert, "id" | "createdAt">,
	heads: readonly NewHead[],
): Promise<string> {
	return platform(async (tx) => {
		const [row] = await tx
			.insert(ledgerAnchors)
			.values(anchor)
			.returning({ id: ledgerAnchors.id });
		const id = row?.id as string;
		// Orgs, die seit dem Lesen der Köpfe gelöscht wurden, fallen weg; die
		// übrigen sind bis zum Ende gesperrt (Löschen wartet, kaskadiert dann)
		const alive = new Set(
			heads.length === 0
				? []
				: (
						await tx
							.select({ id: organization.id })
							.from(organization)
							.where(
								inArray(
									organization.id,
									heads.map((h) => h.orgId),
								),
							)
							.for("key share")
					).map((o) => o.id),
		);
		const rows = heads.filter((h) => alive.has(h.orgId));
		if (rows.length > 0)
			await tx.insert(ledgerHeads).values(
				rows.map((h) => ({
					organizationId: h.orgId,
					anchorId: id,
					seq: BigInt(h.seq),
					count: h.count,
					head: h.head,
					leaf: h.leaf,
					path: h.path,
				})),
			);
		return id;
	});
}

export function pendingAnchors(limit = 20): Promise<LedgerAnchor[]> {
	return globalDb
		.select()
		.from(ledgerAnchors)
		.where(eq(ledgerAnchors.status, "pending"))
		.orderBy(ledgerAnchors.createdAt)
		.limit(limit);
}

export async function updateAnchor(
	id: string,
	patch: Partial<typeof ledgerAnchors.$inferInsert>,
): Promise<void> {
	await globalDb
		.update(ledgerAnchors)
		.set(patch)
		.where(eq(ledgerAnchors.id, id));
}

/** Anker zu Köpfen einer Org (die Köpfe liest die Org selbst unter RLS). */
export function anchorsByIds(ids: readonly string[]): Promise<LedgerAnchor[]> {
	if (ids.length === 0) return Promise.resolve([]);
	return globalDb
		.select()
		.from(ledgerAnchors)
		.where(inArray(ledgerAnchors.id, [...ids]));
}
