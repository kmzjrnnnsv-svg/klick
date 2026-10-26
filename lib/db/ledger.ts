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

/** Letzter Eintrag und Anzahl je Kette (bestehende Orgs + Plattform). */
export function chainHeads(): Promise<ChainHead[]> {
	return platform(async (tx) => {
		const rows = await tx.execute<{
			organization_id: string | null;
			seq: string;
			hash: string;
			n: string;
		}>(sql`
			select distinct on (a.organization_id)
				a.organization_id, a.seq::text as seq, a.hash, c.n::text as n
			from audit_log a
			join (
				select organization_id, count(*) as n
				from audit_log group by organization_id
			) c on c.organization_id is not distinct from a.organization_id
			-- gelöschte Orgs: ihre Kette bleibt im Protokoll, wird aber nicht
			-- mehr verankert (kein Kopf ohne Org)
			where a.organization_id is null
				or exists (select 1 from organization o where o.id = a.organization_id)
			order by a.organization_id, a.seq desc`);
		return rows.map((r) => ({
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
