import { revokeSessionsOfOrgMembers } from "@/lib/auth/org";
import { auth } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { writeTombstone } from "@/lib/storage/tombstones";

// Organisation vollständig entfernen (Crypto-Shredding): Dateien im
// Objektspeicher, Sitzungen der übrigen Mitglieder, dann die Org samt
// Kaskade (vernichtet den Mandantenschlüssel), zuletzt der Tombstone für
// eingespielte Sicherungen. Gemeinsam für „Organisation löschen“ und
// „Neu beginnen“ (app/actions/settings.ts); beide prüfen vorher Step-up,
// Kurzname und Vier-Augen. Die Prüfsummen-Kette der Org bleibt als Spur.
export async function wipeOrganization(input: {
	orgId: string;
	/** Akteur:in behält die eigene Sitzung, um den Vorgang abzuschließen */
	keepUserId: string;
	headers: Headers;
}): Promise<{
	filesDeleted: number;
	sessionsRevoked: number;
	deletedAt: string;
}> {
	const { orgId } = input;
	let filesDeleted = 0;
	const e = env();
	const s3 = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);
	if (s3) {
		const { deleteObjects, listKeys } = await import("@/lib/storage/s3");
		const keys = await listKeys(`org/${orgId}/`);
		filesDeleted = keys.length === 0 ? 0 : await deleteObjects(keys);
	}
	const sessionsRevoked = await revokeSessionsOfOrgMembers(
		orgId,
		input.keepUserId,
	);
	await auth.api.deleteOrganization({
		body: { organizationId: orgId },
		headers: input.headers,
	});
	const deletedAt = new Date().toISOString();
	// Tombstone außerhalb der DB: ein später eingespieltes Backup holt die
	// Löschung nach (scripts/replay-deletions.ts).
	if (s3)
		await writeTombstone({ kind: "organization", orgId, deletedAt }).catch(
			(err) => logger.error({ err, orgId }, "org tombstone failed"),
		);
	return { filesDeleted, sessionsRevoked, deletedAt };
}
