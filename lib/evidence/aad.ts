// AAD bindet den Chiffretext eines Nachweises an seine ID — eine Datei kann
// nicht unter fremder ID ausgeliefert werden. Von Upload (Action) und
// Download (/api/nachweise/[id]) gemeinsam genutzt.
export function evidenceAad(id: string): string {
	return `klick:evidence:${id}`;
}

// Speicherort eines Nachweis-Objekts: S3-Key org/<orgId>/nachweise/<id> oder
// — ohne Objektspeicher — "db:<id>" (Tabelle evidence_blobs)
export const DB_STORAGE_PREFIX = "db:";
export const isDbStorageKey = (key: string) =>
	key.startsWith(DB_STORAGE_PREFIX);
