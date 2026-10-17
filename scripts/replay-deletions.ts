import { and, eq, sql } from "drizzle-orm";
import { globalDb } from "../db";
import { organization } from "../db/auth-schema";
import { evidence, storagePurgeQueue } from "../db/schema";
import { audit } from "../lib/audit";
import { loadEnvFiles } from "../lib/env";
import { purgeAfter } from "../lib/jobs/storage";
import {
	parseTombstone,
	TOMBSTONE_PREFIX,
	type Tombstone,
} from "../lib/storage/tombstones";

// Löschungen nach einem DB-Restore nachholen: `tsx scripts/replay-deletions.ts [--dry-run]`
//
// Tombstones liegen im Objektspeicher (lib/storage/tombstones.ts), nicht in
// der DB — sie überleben den Restore. Je Tombstone:
//   organization  → existiert die Org wieder, wird sie samt Kaskade gelöscht
//                   und ihr Präfix org/<id>/ im Speicher geleert
//   evidence      → existiert die Zeile wieder, wird sie gelöscht und das
//                   Objekt in die Purge-Warteschlange gestellt
// Jede nachgeholte Löschung steht im Audit-Log (System-Akteur).
// Runbook: deploy/README.md → „Restore“.

async function main() {
	loadEnvFiles();
	const dryRun = process.argv.includes("--dry-run");
	const { getBytes, listKeys, deleteObjects } = await import(
		"../lib/storage/s3"
	);
	const keys = await listKeys(TOMBSTONE_PREFIX);
	const stones: Tombstone[] = [];
	for (const key of keys) {
		const t = parseTombstone(new TextDecoder().decode(await getBytes(key)));
		if (t) stones.push(t);
		else console.warn(`· ungültiger Tombstone übersprungen: ${key}`);
	}
	console.log(
		`→ ${stones.length} Tombstones${dryRun ? " (dry-run)" : ""}: ${stones.filter((s) => s.kind === "organization").length} Orgs, ${stones.filter((s) => s.kind === "evidence").length} Nachweise`,
	);

	let orgs = 0;
	let rows = 0;
	for (const t of stones) {
		await globalDb.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
			if (t.kind === "organization") {
				const [o] = await tx
					.select({ id: organization.id })
					.from(organization)
					.where(eq(organization.id, t.orgId))
					.limit(1);
				if (!o) return;
				orgs += 1;
				console.log(`✗ Org ${t.orgId} (gelöscht ${t.deletedAt}) ist zurück`);
				if (dryRun) return;
				await tx.delete(organization).where(eq(organization.id, t.orgId));
				await audit(
					tx,
					{ userId: null },
					{
						action: "org.deletion_replayed",
						organizationId: null,
						target: `organization:${t.orgId}`,
						after: { deletedAt: t.deletedAt },
					},
				);
				return;
			}
			const [row] = await tx
				.select({ id: evidence.id, key: evidence.storageKey })
				.from(evidence)
				.where(and(eq(evidence.id, t.id), eq(evidence.organizationId, t.orgId)))
				.limit(1);
			if (!row) return;
			rows += 1;
			console.log(`✗ Nachweis ${t.id} (gelöscht ${t.deletedAt}) ist zurück`);
			if (dryRun) return;
			await tx.delete(evidence).where(eq(evidence.id, t.id));
			if (row.key)
				await tx
					.insert(storagePurgeQueue)
					.values({
						organizationId: t.orgId,
						storageKey: row.key,
						reason: "evidence_deleted",
						refId: t.id,
						purgeAfter: purgeAfter(new Date(), 0),
					})
					.onConflictDoNothing();
			await audit(
				tx,
				{ userId: null },
				{
					action: "evidence.deletion_replayed",
					organizationId: t.orgId,
					target: `evidence:${t.id}`,
					after: { deletedAt: t.deletedAt },
				},
			);
		});
		if (t.kind === "organization" && !dryRun) {
			const objects = await listKeys(`org/${t.orgId}/`);
			if (objects.length > 0) await deleteObjects(objects);
		}
	}
	console.log(
		`✔ ${dryRun ? "würde" : "hat"} ${orgs} Orgs und ${rows} Nachweise ${dryRun ? "erneut löschen" : "erneut gelöscht"}.`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
