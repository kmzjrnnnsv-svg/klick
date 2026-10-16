import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { evidence, storagePurgeQueue } from "@/db/schema";
import { audit } from "@/lib/audit";
import { s3Configured } from "@/lib/evidence/store";
import { logger } from "@/lib/log";

// Objektspeicher-Hausputz (Backup-Konzept, deploy/README.md):
//   storage-purge    täglich 03:30  Objekte aus storage_purge_queue löschen,
//                                   deren Frist (Backup-Aufbewahrung) um ist
//   storage-orphans  So 04:30       Objekte ohne Nachweis-Zeile finden und in
//                                   die Warteschlange stellen (nicht sofort weg)
// Die Frist entspricht der Aufbewahrung der DB-Backups: Ein Restore findet
// jede Datei, die zum Backup-Zeitpunkt referenziert war.

export function backupRetentionDays(): number {
	const n = Number(process.env.BACKUP_KEEP_DAYS ?? "30");
	return Number.isFinite(n) && n >= 1 ? n : 30;
}

export function purgeAfter(now: Date, days = backupRetentionDays()): Date {
	return new Date(now.getTime() + days * 86_400_000);
}

// Waisen: Objekte unter org/<orgId>/nachweise/, die keine Nachweis-Zeile
// referenziert und die nicht schon in der Warteschlange stehen. Frische
// Objekte (< graceMs) sind evtl. mitten im Upload — die bleiben.
export function findOrphans(
	objects: readonly { key: string; lastModified: Date | null }[],
	referenced: ReadonlySet<string>,
	queued: ReadonlySet<string>,
	now: Date,
	graceMs = 24 * 3_600_000,
): string[] {
	return objects
		.filter((o) => !referenced.has(o.key) && !queued.has(o.key))
		.filter(
			(o) =>
				o.lastModified === null ||
				now.getTime() - o.lastModified.getTime() > graceMs,
		)
		.map((o) => o.key)
		.sort();
}

async function platformTx<T>(
	fn: (
		tx: Parameters<Parameters<typeof globalDb.transaction>[0]>[0],
	) => Promise<T>,
): Promise<T> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

export async function runStoragePurge(
	now = new Date(),
): Promise<{ purged: number; failed: number }> {
	if (!s3Configured()) return { purged: 0, failed: 0 };
	const due = await platformTx((tx) =>
		tx
			.select({
				id: storagePurgeQueue.id,
				orgId: storagePurgeQueue.organizationId,
				key: storagePurgeQueue.storageKey,
				reason: storagePurgeQueue.reason,
			})
			.from(storagePurgeQueue)
			.where(
				and(
					isNull(storagePurgeQueue.purgedAt),
					lte(storagePurgeQueue.purgeAfter, now),
				),
			)
			.limit(1000),
	);
	if (due.length === 0) return { purged: 0, failed: 0 };
	const { deleteObject } = await import("@/lib/storage/s3");
	const done = new Map<string, string[]>();
	let failed = 0;
	for (const row of due) {
		try {
			await deleteObject(row.key);
			const list = done.get(row.orgId) ?? [];
			list.push(row.id);
			done.set(row.orgId, list);
		} catch (err) {
			failed += 1;
			logger.warn({ err, key: row.key }, "storage purge failed");
		}
	}
	let purged = 0;
	for (const [orgId, ids] of done) {
		await platformTx(async (tx) => {
			for (const id of ids)
				await tx
					.update(storagePurgeQueue)
					.set({ purgedAt: now })
					.where(eq(storagePurgeQueue.id, id));
			await audit(
				tx,
				{ userId: null },
				{
					action: "storage.purged",
					organizationId: orgId,
					target: `organization:${orgId}`,
					after: { objects: ids.length },
				},
			);
		});
		purged += ids.length;
	}
	logger.info({ purged, failed }, "storage purge");
	return { purged, failed };
}

export async function runStorageOrphans(
	now = new Date(),
): Promise<{ orgs: number; orphans: number }> {
	if (!s3Configured()) return { orgs: 0, orphans: 0 };
	const { listObjects } = await import("@/lib/storage/s3");
	const orgs = await platformTx((tx) =>
		tx.select({ id: organization.id }).from(organization),
	);
	let orphans = 0;
	for (const { id: orgId } of orgs) {
		const objects = await listObjects(`org/${orgId}/nachweise/`);
		if (objects.length === 0) continue;
		await platformTx(async (tx) => {
			const refs = await tx
				.select({ key: evidence.storageKey })
				.from(evidence)
				.where(eq(evidence.organizationId, orgId));
			const queued = await tx
				.select({ key: storagePurgeQueue.storageKey })
				.from(storagePurgeQueue)
				.where(eq(storagePurgeQueue.organizationId, orgId));
			const found = findOrphans(
				objects,
				new Set(refs.map((r) => r.key).filter((k): k is string => Boolean(k))),
				new Set(queued.map((q) => q.key)),
				now,
			);
			if (found.length === 0) return;
			await tx
				.insert(storagePurgeQueue)
				.values(
					found.map((key) => ({
						organizationId: orgId,
						storageKey: key,
						reason: "orphan" as const,
						purgeAfter: purgeAfter(now),
					})),
				)
				.onConflictDoNothing();
			await audit(
				tx,
				{ userId: null },
				{
					action: "storage.orphans_queued",
					organizationId: orgId,
					target: `organization:${orgId}`,
					after: { objects: found.length },
				},
			);
			orphans += found.length;
		});
	}
	logger.info({ orgs: orgs.length, orphans }, "storage orphans");
	return { orgs: orgs.length, orphans };
}
