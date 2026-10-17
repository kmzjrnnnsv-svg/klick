import { eq } from "drizzle-orm";
import { securityScans } from "@/db/schema";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { importScan } from "./import-service";
import { runQuickCheck } from "./quick-check/run";

// Ausführung eines Schnellchecks (Job „quick-check“ oder after()-Fallback):
// passiver Abruf, dann Import wie jeder Scan (Vollscan: nicht mehr Gefundenes
// wird behoben). Fehler landen am Scan, nie als Ausnahme beim Aufrufer.

export const QUICK_CHECK_JOB = "quick-check";
// Kontingent je Org und 24 Stunden (Schutz der Ziele und der Plattform)
export const QUICK_CHECKS_PER_DAY = 10;

export type QuickCheckJob = {
	orgId: string;
	scanId: string;
	url: string;
	userId: string | null;
};

export async function executeQuickCheck(job: QuickCheckJob): Promise<void> {
	const ctx = { orgId: job.orgId, userId: job.userId };
	const fail = (error: string) =>
		mutateOrg(ctx, async (tx) => {
			await tx
				.update(securityScans)
				.set({ status: "failed", error, finishedAt: new Date() })
				.where(eq(securityScans.id, job.scanId));
			return {
				result: null,
				audit: {
					action: "security.quick_check_failed",
					target: `security_scan:${job.scanId}`,
					after: { url: job.url, error },
				},
			};
		});
	try {
		const [scan] = await readOrg(ctx, (tx) =>
			tx
				.select({
					productId: securityScans.productId,
					status: securityScans.status,
				})
				.from(securityScans)
				.where(eq(securityScans.id, job.scanId))
				.limit(1),
		);
		if (!scan || scan.status !== "running") return;
		const r = await runQuickCheck(job.url);
		if (!r.ok) {
			await fail(r.error);
			return;
		}
		await mutateOrg(ctx, async (tx) => {
			const res = await importScan(tx, ctx, {
				parsed: r.scan,
				source: "quick_check",
				fullScan: true,
				productId: scan.productId,
				scanId: job.scanId,
			});
			return { result: res, audit: res.audits };
		});
	} catch (err) {
		logger.error({ err, scanId: job.scanId }, "Schnellcheck fehlgeschlagen");
		await fail("internal").catch(() => {});
	}
}
