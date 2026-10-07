import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { globalDb } from "@/db";
import { organization, user } from "@/db/auth-schema";
import { notifications } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { logger } from "@/lib/log";
import { runComplianceTick } from "./compliance-tick-runner";
import { runDigest, runImmediateMails } from "./digest";
import { runPostureSnapshot } from "./posture";
import { runRetention } from "./retention";

// Job-Register (ADR-011). Zeitpläne in Europe/Berlin. Fachjobs laufen je Org
// in eigenem RLS-Kontext (lib/db/with-org.ts#forEachOrg):
//   compliance-tick    stündlich   Reviews, Fristen, SLA, Ausnahmen, Schulungen,
//                                  Vorfall-Uhren, Kenntnisnahmen → Notifications/Tasks
//   notification-mail  alle 5 min  Sofort-Mails (IMMEDIATE_MAIL_KINDS)
//   digest             07:00       Tages-Digest je Person
//   verify-audit-chain 04:00       Hash-Kette je Org prüfen
//   retention          03:00       Sitzungen, Tokens, gelesene Benachrichtigungen > 180 d
//   posture-snapshot   02:00       Abdeckung je Org/Rahmenwerk → Verlauf auf /ueberblick

export const JOBS = {
	complianceTick: "compliance-tick",
	notificationMail: "notification-mail",
	retention: "retention",
	postureSnapshot: "posture-snapshot",
	digest: "digest",
	verifyAuditChain: "verify-audit-chain",
} as const;

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS)) {
		await boss.createQueue(name);
	}

	await boss.schedule(JOBS.complianceTick, "0 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.notificationMail, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.postureSnapshot, "0 2 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.digest, "0 7 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });

	await boss.work(JOBS.complianceTick, async () => {
		await runComplianceTick();
		// Fällige Vorfall-Fristen o. ä. sollen nicht bis zum nächsten 5-min-Lauf warten.
		await runImmediateMails();
	});
	await boss.work(JOBS.notificationMail, async () => {
		await runImmediateMails();
	});
	await boss.work(JOBS.retention, async () => {
		await runRetention();
	});
	await boss.work(JOBS.postureSnapshot, async () => {
		await runPostureSnapshot();
	});
	await boss.work(JOBS.digest, async () => {
		await runDigest();
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
