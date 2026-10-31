import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { verifyAuditChain } from "@/lib/audit";
import { runLedgerAnchor, upgradePendingAnchors } from "@/lib/ledger/service";
import { logger } from "@/lib/log";
import { notifyPlatformAdmins } from "@/lib/notifications/notify";
import {
	executeQuickCheck,
	QUICK_CHECK_JOB,
	type QuickCheckJob,
} from "@/lib/security/quick-check-service";
import { runComplianceTick } from "./compliance-tick-runner";
import { runDigest, runImmediateMails } from "./digest";
import { runEvidenceTexts } from "./evidence-texts";
import { runPostureSnapshot } from "./posture";
import { runPushNotify } from "./push-notify";
import { runRetention } from "./retention";
import { runSecurityChanges } from "./security-changes";
import { runSsoMetadata } from "./sso-metadata";
import { runStorageOrphans, runStoragePurge } from "./storage";
import { runTeamsNotify } from "./teams-notify";

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
//   security-changes   alle 5 min  Sicherheitsänderungen nach 24 h Wartezeit setzen
//   ledger-anchor      alle 10 min Verlauf verankern: täglich ab 02:30 und nach
//                                  kritischen Ereignissen (OpenTimestamps)
//   ledger-upgrade     stündlich   Bitcoin-Beglaubigung offener Anker holen
//   evidence-texts     alle 15 min Text vorhandener Dateien für den Fassungs-
//                                  vergleich lesen (isolierter Parser)
//   teams-notify       jede Minute Benachrichtigungen in Microsoft Teams
//   push-notify        jede Minute Push-Benachrichtigungen (Web Push)
//                                  zustellen (nur mit TEAMS_CLIENT_ID)
//   sso-metadata       05:40       SAML-Metadaten neu holen, neues Zertifikat
//                                  vormerken, Ablauf 30/7 Tage erinnern
// Die Wallet-Jobs (wallet-sync, price-tick, wallet-payouts) laufen seit K6 nur
// noch in both.money (apps/wallet/lib/jobs); alte Zeitpläne räumt der Start ab.

export const JOBS = {
	complianceTick: "compliance-tick",
	notificationMail: "notification-mail",
	retention: "retention",
	postureSnapshot: "posture-snapshot",
	digest: "digest",
	verifyAuditChain: "verify-audit-chain",
	storagePurge: "storage-purge",
	storageOrphans: "storage-orphans",
	securityChanges: "security-changes",
	ledgerAnchor: "ledger-anchor",
	ledgerUpgrade: "ledger-upgrade",
	evidenceTexts: "evidence-texts",
	teamsNotify: "teams-notify",
	pushNotify: "push-notify",
	ssoMetadata: "sso-metadata",
	quickCheck: QUICK_CHECK_JOB,
} as const;

// Frühere Wallet-Jobs in Klick (bis K6) — Zeitpläne entfernen
const LEGACY_JOBS = ["wallet-sync", "price-tick", "wallet-payouts"] as const;

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS)) await boss.createQueue(name);
	for (const name of LEGACY_JOBS) await boss.unschedule(name).catch(() => {});

	await boss.schedule(JOBS.complianceTick, "0 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.notificationMail, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.postureSnapshot, "0 2 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.digest, "0 7 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.storagePurge, "30 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.storageOrphans, "30 4 * * 0", {}, { tz: TZ });
	await boss.schedule(JOBS.securityChanges, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.ledgerAnchor, "*/10 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.ledgerUpgrade, "17 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.evidenceTexts, "*/15 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.teamsNotify, "* * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.pushNotify, "* * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.ssoMetadata, "40 5 * * *", {}, { tz: TZ });

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
	await boss.work(JOBS.securityChanges, async () => {
		await runSecurityChanges();
		// „Nach Wartezeit wirksam“ sofort zustellen
		await runImmediateMails();
	});
	await boss.work(JOBS.ledgerAnchor, async () => {
		await runLedgerAnchor();
	});
	await boss.work(JOBS.ledgerUpgrade, async () => {
		await upgradePendingAnchors();
	});
	await boss.work(JOBS.evidenceTexts, async () => {
		await runEvidenceTexts();
	});
	await boss.work(JOBS.teamsNotify, async () => {
		await runTeamsNotify();
	});
	await boss.work(JOBS.pushNotify, async () => {
		await runPushNotify();
	});
	await boss.work(JOBS.ssoMetadata, async () => {
		await runSsoMetadata();
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
