import type { PgBoss } from "pg-boss";
import { runVerifyAuditChains } from "./audit-chain";
import { runImmediateMails } from "./mails";
import { runRetention } from "./retention";

export const JOBS = {
	notificationMail: "notification-mail",
	retention: "retention",
	verifyAuditChain: "verify-audit-chain",
} as const;

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS)) await boss.createQueue(name);
	await boss.schedule(JOBS.notificationMail, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });
	await boss.work(JOBS.notificationMail, async () => {
		await runImmediateMails();
	});
	await boss.work(JOBS.retention, async () => {
		await runRetention();
	});
	await boss.work(JOBS.verifyAuditChain, async () => {
		await runVerifyAuditChains();
	});
}
