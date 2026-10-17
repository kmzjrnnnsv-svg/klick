import { sql } from "drizzle-orm";
import { globalDb } from "../db";
import { orgSettings } from "../db/schema";
import { audit } from "../lib/audit";
import { initializeOrg } from "../lib/compliance/initialize-org";
import { getOrgProfile } from "../lib/compliance/queries";
import { withOrg } from "../lib/db/with-org";
import { loadEnvFiles } from "../lib/env";

// Arbeitsvorrat aller Orgs nachziehen: `tsx scripts/backfill-work-queue.ts [--dry-run]`
//
// Nach Katalog-Updates (neue Rahmenwerke, künftig geltende Anforderungen wie
// AMLR/CRA) fehlen bestehenden Orgs Control-Zeilen. initializeOrg ist
// idempotent: legt fehlende Controls an, schreibt abgeleitete Anwendbarkeit
// neu, manuelle Entscheidungen und Status bleiben. Je Org ein Audit-Eintrag
// (System-Akteur). --dry-run rechnet in einer Transaktion und rollt zurück.

class DryRun extends Error {
	constructor(readonly created: number) {
		super("dry-run");
	}
}

async function main() {
	loadEnvFiles();
	const dryRun = process.argv.includes("--dry-run");
	const orgIds = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const rows = await tx
			.select({ orgId: orgSettings.organizationId })
			.from(orgSettings);
		return rows.map((r) => r.orgId);
	});
	console.log(`→ ${orgIds.length} Organisationen${dryRun ? " (dry-run)" : ""}`);

	let total = 0;
	for (const orgId of orgIds) {
		try {
			const created = await withOrg({ orgId, userId: null }, async (tx) => {
				const p = await getOrgProfile(tx, orgId);
				if (!p) return 0;
				const init = await initializeOrg(tx, {
					orgId,
					userId: null,
					frameworks: p.frameworks,
					sector: p.profile.sector,
					licenceStage: p.profile.licenceStage,
					caspServices: p.profile.caspServices,
					applyBaseline: p.profile.applyBaseline,
					tlptDesignated: p.profile.tlptDesignated,
					issuesTokens: p.profile.issuesTokens,
				});
				if (dryRun) throw new DryRun(init.controlsCreated);
				await audit(
					tx,
					{ userId: null },
					{
						action: "org.work_queue_backfilled",
						target: `organization:${orgId}`,
						after: { init },
						organizationId: orgId,
					},
				);
				return init.controlsCreated;
			});
			total += created;
			console.log(`✔ ${orgId}: ${created} Controls angelegt`);
		} catch (err) {
			if (err instanceof DryRun) {
				total += err.created;
				console.log(`· ${orgId}: ${err.created} Controls würden angelegt`);
				continue;
			}
			throw err;
		}
	}
	console.log(
		`✔ ${dryRun ? "würde" : "hat"} ${total} Control-Zeilen ${dryRun ? "anlegen" : "angelegt"}.`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
