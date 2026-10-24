import { configuredNetworks } from "@wallet/lib/wallet/node-clients";
import { signerConfigured } from "@wallet/lib/wallet/signer/client";
import type { PgBoss } from "pg-boss";
import { runVerifyAuditChains } from "./audit-chain";
import { runDayClose, runKlickExport } from "./klick-export";
import { runImmediateMails } from "./mails";
import { runPriceTick } from "./price-tick";
import { runRetention } from "./retention";
import { runWalletPayouts } from "./wallet-payouts";
import { runWalletSync } from "./wallet-sync";

export const JOBS = {
	notificationMail: "notification-mail",
	retention: "retention",
	verifyAuditChain: "verify-audit-chain",
	walletSync: "wallet-sync",
	priceTick: "price-tick",
	walletPayouts: "wallet-payouts",
	klickExport: "klick-export",
	exportDayClose: "export-day-close",
} as const;

// Jede Minute und nie doppelt: Sync, Kurse, Auszahlungen (einziger Schreiber)
const SINGLETON = new Set<string>([
	JOBS.walletSync,
	JOBS.priceTick,
	JOBS.walletPayouts,
]);

const TZ = "Europe/Berlin";

export async function registerJobs(boss: PgBoss): Promise<void> {
	for (const name of Object.values(JOBS))
		await boss.createQueue(
			name,
			SINGLETON.has(name) ? { policy: "singleton" } : undefined,
		);
	await boss.schedule(JOBS.notificationMail, "*/5 * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.retention, "0 3 * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.verifyAuditChain, "0 4 * * *", {}, { tz: TZ });
	// Export nach Klick: läuft nur für Orgs mit Verbindung (sonst sofort fertig)
	await boss.schedule(JOBS.klickExport, "* * * * *", {}, { tz: TZ });
	await boss.schedule(JOBS.exportDayClose, "10 0 * * *", {}, { tz: TZ });
	const networks = configuredNetworks();
	if (networks.length > 0)
		await boss.schedule(JOBS.walletSync, "* * * * *", {}, { tz: TZ });
	else await boss.unschedule(JOBS.walletSync).catch(() => {});
	if (networks.some((n) => n.startsWith("ethereum")))
		await boss.schedule(JOBS.priceTick, "* * * * *", {}, { tz: TZ });
	else await boss.unschedule(JOBS.priceTick).catch(() => {});
	if (signerConfigured())
		await boss.schedule(JOBS.walletPayouts, "* * * * *", {}, { tz: TZ });
	else await boss.unschedule(JOBS.walletPayouts).catch(() => {});

	await boss.work(JOBS.notificationMail, async () => {
		await runImmediateMails();
	});
	await boss.work(JOBS.retention, async () => {
		await runRetention();
	});
	await boss.work(JOBS.verifyAuditChain, async () => {
		await runVerifyAuditChains();
	});
	await boss.work(JOBS.walletSync, async () => {
		await runWalletSync();
	});
	await boss.work(JOBS.priceTick, async () => {
		await runPriceTick();
	});
	await boss.work(JOBS.walletPayouts, async () => {
		await runWalletPayouts();
	});
	await boss.work(JOBS.klickExport, async () => {
		await runKlickExport();
	});
	await boss.work(JOBS.exportDayClose, async () => {
		await runDayClose();
	});
}
