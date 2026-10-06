import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { globalDb } from "@/db";
import { organization, user } from "@/db/auth-schema";
import { notifications } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { logger } from "@/lib/log";

// Job-Register. Zeitpläne in Europe/Berlin. Handler laufen je Org in eigenem
// RLS-Kontext (lib/db/with-org.ts#forEachOrg) — hier in P0 nur das Gerüst
// plus die tägliche Kettenprüfung; Fachjobs folgen in P1–P4.

export const JOBS = {
	complianceTick: "compliance-tick", // stündlich: Reviews, Fristen, Pflichten-Läufe
	retention: "retention", // täglich: Sessions/Verification/gelesene Notifications
	postureSnapshot: "posture-snapshot", // täglich: Abdeckung je Rahmenwerk
	digest: "digest", // täglich 07:00: Tages-Digest per Mail
	verifyAuditChain: "verify-audit-chain", // täglich: Hash-Kette je Org prüfen
} as const;

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS)) {
		await boss.createQueue(name);
	}

	await boss.schedule(JOBS.complianceTick, "0 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.postureSnapshot, "0 2 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.digest, "0 7 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });

	await boss.work(JOBS.complianceTick, async () => {
		logger.debug("compliance-tick: noch kein Fachinhalt (P1+)");
	});
	await boss.work(JOBS.retention, async () => {
		logger.debug("retention: noch kein Fachinhalt (P4)");
	});
	await boss.work(JOBS.postureSnapshot, async () => {
		logger.debug("posture-snapshot: noch kein Fachinhalt (P4)");
	});
	await boss.work(JOBS.digest, async () => {
		logger.debug("digest: noch kein Fachinhalt (P4)");
	});
	await boss.work(JOBS.verifyAuditChain, async () => {
		await runVerifyAuditChain();
	});
}

// Prüft die Plattform-Kette und jede Org-Kette. Ein Bruch ist ein
// Sicherheitsvorfall: Alarm an alle Plattform-Admins + Fatal-Log.
export async function runVerifyAuditChain(): Promise<{
	checked: number;
	broken: string[];
}> {
	const broken: string[] = [];
	let checked = 0;
	await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const orgs = await tx.select({ id: organization.id }).from(organization);
		const chains: (string | null)[] = [null, ...orgs.map((o) => o.id)];
		for (const orgId of chains) {
			const result = await verifyAuditChain(tx, orgId);
			checked += result.checked;
			if (!result.ok) {
				broken.push(orgId ?? "platform");
				logger.fatal(
					{ orgId, brokenAtSeq: result.brokenAtSeq, reason: result.reason },
					"audit chain broken",
				);
			}
		}
		if (broken.length > 0) {
			const admins = await tx
				.select({ id: user.id })
				.from(user)
				.where(eq(user.role, "admin"));
			for (const admin of admins) {
				await tx.insert(notifications).values({
					userId: admin.id,
					kind: "security_alert",
					title: "Audit-Kette gebrochen",
					body: `Betroffen: ${broken.join(", ")}`,
					link: "/admin/audit",
				});
			}
		}
	});
	return { checked, broken };
}
