import { sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { frameworks, postureSnapshots } from "@/db/schema";
import { orgCoverage } from "@/lib/compliance/queries";
import { forEachOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";

// Posture-Snapshot (täglich 02:00): je Org und Rahmenwerk Abdeckung und
// Fortschritt des Tages festhalten → Verlaufskurve auf /ueberblick. Die
// Rechnung bleibt abgeleitet; der Snapshot ist nur die Historie.

export async function runPostureSnapshot(now = new Date()): Promise<number> {
	const date = now.toISOString().slice(0, 10);
	const orgs = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return tx.select({ id: organization.id }).from(organization);
	});
	let written = 0;
	await forEachOrg(
		orgs.map((o) => o.id),
		async (tx, orgId) => {
			const cov = await orgCoverage(tx, orgId);
			if (!cov) return;
			const fwRows = await tx
				.select({ id: frameworks.id, slug: frameworks.slug })
				.from(frameworks);
			const idBySlug = new Map(fwRows.map((f) => [f.slug, f.id]));
			for (const slug of cov.frameworks) {
				const bucket = cov.result.byFramework.get(slug);
				const frameworkId = idBySlug.get(slug);
				if (!bucket || bucket.total === 0 || !frameworkId) continue;
				await tx
					.insert(postureSnapshots)
					.values({
						organizationId: orgId,
						frameworkId,
						date,
						coveragePct:
							bucket.coveragePct === null ? null : String(bucket.coveragePct),
						progressPct:
							bucket.progressPct === null ? null : String(bucket.progressPct),
						counts: {
							applicable: bucket.applicable,
							covered: bucket.covered,
							partial: bucket.partial,
							open: bucket.open,
						},
					})
					.onConflictDoUpdate({
						target: [
							postureSnapshots.organizationId,
							postureSnapshots.frameworkId,
							postureSnapshots.date,
						],
						set: {
							coveragePct:
								bucket.coveragePct === null ? null : String(bucket.coveragePct),
							progressPct:
								bucket.progressPct === null ? null : String(bucket.progressPct),
							counts: {
								applicable: bucket.applicable,
								covered: bucket.covered,
								partial: bucket.partial,
								open: bucket.open,
							},
						},
					});
				written += 1;
			}
		},
	);
	logger.info(
		{ job: "posture-snapshot", orgs: orgs.length, written },
		"posture done",
	);
	return written;
}
