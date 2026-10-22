import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { verifyAuditChain } from "@/lib/audit";
import { logger } from "@/lib/log";
import { notifyPlatformAdmins } from "@/lib/notifications/notify";
import {
	executeQuickCheck,
	QUICK_CHECK_JOB,
	type QuickCheckJob,
} from "@/lib/security/quick-check-service";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import { runComplianceTick } from "./compliance-tick-runner";
import { runDigest, runImmediateMails } from "./digest";
import { runPostureSnapshot } from "./posture";
import { runPriceTick } from "./price-tick";
import { runRetention } from "./retention";
import { runStorageOrphans, runStoragePurge } from "./storage";
import { runWalletSync } from "./wallet-sync";

// Job-Register (ADR-011). Zeitpläne in Europe/Berlin. Fachjobs laufen je Org
// in eigenem RLS-Kontext (lib/db/with-org.ts#forEachOrg):
//   compliance-tick    stündlich   Reviews, Fristen, SLA, Ausnahmen, Schulungen,
//                                  Vorfall-Uhren, Kenntnisnahmen → Notifications/Tasks
//   notification-mail  alle 5 min  Sofort-Mails (IMMEDIATE_MAIL_KINDS)
//   digest             07:00       Tages-Digest je Person
//   verify-audit-chain 04:00       Hash-Kette je Org prüfen
//   retention          03:00       Sitzungen, Tokens, gelesene Benachrichtigungen > 180 d
//   posture-snapshot   02:00       Abdeckung je Org/Rahmenwerk → Verlauf auf /ueberblick
//   storage-purge      03:30       gelöschte Nachweis-Objekte nach Backup-Frist entfernen
//   storage-orphans    So 04:30    Objekte ohne Nachweis-Zeile in die Purge-Warteschlange
//   wallet-sync        jede Minute Bewegungen und Stand der Wallet-Konten von den
//                                  eigenen Knoten (nur mit WALLET_RPC_*, eine Instanz)
//   price-tick         jede Minute Chainlink-Kurse über den eigenen Ethereum-Knoten
//                                  (+ Verlauf rückwärts auffüllen, eine Instanz)

export const JOBS = {
	complianceTick: "compliance-tick",
	notificationMail: "notification-mail",
	retention: "retention",
	postureSnapshot: "posture-snapshot",
	digest: "digest",
	verifyAuditChain: "verify-audit-chain",
	storagePurge: "storage-purge",
	storageOrphans: "storage-orphans",
	quickCheck: QUICK_CHECK_JOB,
	walletSync: "wallet-sync",
	priceTick: "price-tick",
} as const;

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS)) {
		// wallet-sync: nie zwei Läufe gleichzeitig (Knoten-Abfragen dauern)
		await boss.createQueue(
			name,
			name === JOBS.walletSync || name === JOBS.priceTick
				? { policy: "singleton" }
				: undefined,
		);
	}

	await boss.schedule(JOBS.complianceTick, "0 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.notificationMail, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.postureSnapshot, "0 2 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.digest, "0 7 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.storagePurge, "30 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.storageOrphans, "30 4 * * 0", {}, { tz: TZ });
	const networks = configuredNetworks();
	if (networks.length > 0)
		await boss.schedule(JOBS.walletSync, "* * * * *", {}, { tz: TZ });
	else await boss.unschedule(JOBS.walletSync).catch(() => {});
	if (networks.some((n) => n.startsWith("ethereum")))
		await boss.schedule(JOBS.priceTick, "* * * * *", {}, { tz: TZ });
	else await boss.unschedule(JOBS.priceTick).catch(() => {});

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
	await boss.work(JOBS.storagePurge, async () => {
		await runStoragePurge();
	});
	await boss.work(JOBS.storageOrphans, async () => {
		await runStorageOrphans();
	});
	await boss.work(JOBS.walletSync, async () => {
		await runWalletSync();
	});
	await boss.work(JOBS.priceTick, async () => {
		await runPriceTick();
	});
	// Schnellcheck auf Anfrage: höchstens zwei gleichzeitig je Prozess
	await boss.work<QuickCheckJob>(
		JOBS.quickCheck,
		{ localConcurrency: 2 },
		async (jobs) => {
			for (const job of jobs) await executeQuickCheck(job.data);
		},
	);
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
		if (broken.length > 0)
			await notifyPlatformAdmins(tx, {
				kind: "security_alert",
				title: "Audit-Kette gebrochen",
				body: `Betroffen: ${broken.join(", ")}`,
				link: "/admin/audit",
			});
	});
	return { checked, broken };
}
