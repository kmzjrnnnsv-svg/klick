import { sql } from "drizzle-orm";
import { identitySources } from "@/db/schema";
import { mainDb } from "@/lib/db/job-scope";
import { syncIdentitySource } from "@/lib/identity/sync";
import { logger } from "@/lib/log";
import { enqueue } from "./boss";

// Identität (Teil D): täglich 05:15 Berlin je verbundener Quelle einen
// Abruf in die Warteschlange `identity-sync-source` (höchstens zwei
// gleichzeitig). „Jetzt abrufen“ nutzt dieselbe Warteschlange.

export const IDENTITY_SYNC_SOURCE_JOB = "identity-sync-source";
export type IdentitySyncJob = { orgId: string; sourceId: string };

export async function runIdentitySync(): Promise<{ queued: number }> {
	const rows = await mainDb().transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return tx
			.select({
				orgId: identitySources.organizationId,
				sourceId: identitySources.id,
			})
			.from(identitySources)
			.where(sql`${identitySources.status} <> 'pending_consent'`);
	});
	let queued = 0;
	for (const r of rows) {
		if (await enqueue(IDENTITY_SYNC_SOURCE_JOB, r)) queued += 1;
		else
			await runIdentitySyncSource(r).catch((err) =>
				logger.warn({ err, orgId: r.orgId }, "identity sync failed"),
			);
	}
	return { queued };
}

export async function runIdentitySyncSource(job: IdentitySyncJob) {
	if (
		!/^[0-9a-f-]{36}$/i.test(job.orgId) ||
		!/^[0-9a-f-]{36}$/i.test(job.sourceId)
	)
		return "skipped" as const;
	return syncIdentitySource(job.orgId, job.sourceId);
}
