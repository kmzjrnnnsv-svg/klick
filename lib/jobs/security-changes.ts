import { and, eq, lte, sql } from "drizzle-orm";
import { securityChanges } from "@/db/schema";
import { mainDb } from "@/lib/db/job-scope";
import { forEachOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { applyDueChanges } from "@/lib/security-changes/service";

// Job security-changes (alle 5 min): Sicherheitsänderungen, deren 24-h-
// Wartezeit vorbei ist und die niemand abgebrochen hat, setzen (Härtung A4).
// Erst die Orgs mit fälligen Anträgen im Plattform-Scope finden, dann je Org
// im eigenen Kontext wirken lassen.
export async function runSecurityChanges(now = new Date()): Promise<number> {
	const orgIds = await mainDb().transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const rows = await tx
			.selectDistinct({ orgId: securityChanges.organizationId })
			.from(securityChanges)
			.where(
				and(
					eq(securityChanges.status, "waiting"),
					lte(securityChanges.applyAfter, now),
				),
			);
		return rows.map((r) => r.orgId);
	});
	let applied = 0;
	await forEachOrg(orgIds, async (tx, orgId) => {
		applied += await applyDueChanges(tx, orgId, now);
	});
	if (applied > 0) logger.info({ applied }, "security-changes applied");
	return applied;
}
