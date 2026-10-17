import { sql } from "drizzle-orm";
import type { OrgTx } from "./with-org";

// Laufende Nummern je Org (RSK-…, INC-…, NC-…, Dokumentnummern) entstehen
// aus „höchste vorhandene + 1“. Ohne Sperre ziehen zwei gleichzeitige
// Anlagen dieselbe Nummer, und die zweite scheitert am Unique-Index mit einem
// allgemeinen Fehler. Die transaktionslokale Advisory-Sperre serialisiert die
// Vergabe je Org; unter READ COMMITTED sieht die wartende Transaktion danach
// die gerade vergebene Nummer.
export async function lockOrgSequence(tx: OrgTx, orgId: string): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${orgId}::text || ':seq'))`,
	);
}

// Gleiche Idee für „vorhandene prüfen, fehlende anlegen“ ohne Unique-Index
// (z. B. Pflichten-Läufe: Tick und „Aus Katalog übernehmen“ gleichzeitig).
export async function lockOrgScope(
	tx: OrgTx,
	orgId: string,
	scope: string,
): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${orgId}::text || ':' || ${scope}::text))`,
	);
}
