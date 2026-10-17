// Lösch-Tombstones im Objektspeicher (nicht in der DB!): Wird ein DB-Backup
// eingespielt, sind Löschungen nach dem Backup-Zeitpunkt dort nicht mehr
// sichtbar. Die Tombstones liegen außerhalb der Datenbank und überleben den
// Restore; scripts/replay-deletions.ts führt sie danach erneut aus (DSGVO
// Art. 17, Löschkonzept CC-AST-10). Inhalt: nur IDs und Zeitpunkt.

export type Tombstone =
	| { kind: "organization"; orgId: string; deletedAt: string }
	| { kind: "evidence"; orgId: string; id: string; deletedAt: string };

export const TOMBSTONE_PREFIX = "tombstones/";

export function tombstoneKey(t: Tombstone): string {
	return t.kind === "organization"
		? `${TOMBSTONE_PREFIX}organization/${t.orgId}.json`
		: `${TOMBSTONE_PREFIX}evidence/${t.orgId}/${t.id}.json`;
}

const UUID = /^[0-9a-f-]{36}$/i;

export function parseTombstone(raw: string): Tombstone | null {
	try {
		const v = JSON.parse(raw) as Partial<Tombstone> & { id?: string };
		if (!v || typeof v.orgId !== "string" || !UUID.test(v.orgId)) return null;
		if (typeof v.deletedAt !== "string") return null;
		if (v.kind === "organization")
			return { kind: "organization", orgId: v.orgId, deletedAt: v.deletedAt };
		if (v.kind === "evidence" && typeof v.id === "string" && UUID.test(v.id))
			return {
				kind: "evidence",
				orgId: v.orgId,
				id: v.id,
				deletedAt: v.deletedAt,
			};
		return null;
	} catch {
		return null;
	}
}

export async function writeTombstone(t: Tombstone): Promise<void> {
	const { putBytes } = await import("./s3");
	await putBytes(
		tombstoneKey(t),
		new TextEncoder().encode(JSON.stringify(t)),
		"application/json",
	);
}
