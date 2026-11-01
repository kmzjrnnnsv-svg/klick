import { sql } from "drizzle-orm";
import type { OrgTx } from "@/lib/db/with-org";

// Zwischenspeicher je Org über Anfragen hinweg (Leistung bei wachsenden
// Daten): abgeleitete Werte, die viele Register lesen (z. B. Prüfsummen der
// Nachweisarten), rechnet Klick nur neu, wenn sich in der Org etwas
// geändert hat. Erkennungszeichen ist der Kopf der Prüfsummen-Kette
// (audit_log.seq): jede Mutation schreibt als letzte Anweisung einen
// Audit-Eintrag (mutateOrg), der Kopf wandert also mit jeder Änderung.
// Sicherheitsnetz: höchstens TTL_MS alt (Schreibstellen ohne Audit, Jobs)
// und höchstens MAX_ENTRIES Werte im Prozess (ein Server, ADR-016).
//
// Werte gehören der Org, deren Kontext die Transaktion trägt; gespeichert
// wird nur, was der Aufrufer ausdrücklich ablegt. Werte nie verändern —
// sie gehen an mehrere Anfragen.

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 2_000;

type Entry = { stamp: string; at: number; value: unknown };
const store = new Map<string, Entry>();

/** Kopf der Prüfsummen-Kette der Org (eine indizierte Abfrage) */
export async function orgStamp(tx: OrgTx, orgId: string): Promise<string> {
	const rows = await tx.execute<{ seq: string | null }>(sql`
		select max(seq)::text as seq from audit_log where organization_id = ${orgId}`);
	return rows[0]?.seq ?? "0";
}

export async function orgDerived<T>(
	tx: OrgTx,
	orgId: string,
	key: string,
	compute: () => Promise<T>,
	stamp?: string,
): Promise<T> {
	const s = stamp ?? (await orgStamp(tx, orgId));
	const k = `${orgId}|${key}`;
	const hit = store.get(k);
	const now = Date.now();
	if (hit && hit.stamp === s && now - hit.at < TTL_MS) {
		// zuletzt genutzt nach hinten (LRU)
		store.delete(k);
		store.set(k, hit);
		return hit.value as T;
	}
	const value = await compute();
	store.set(k, { stamp: s, at: now, value });
	while (store.size > MAX_ENTRIES) {
		const oldest = store.keys().next().value;
		if (oldest === undefined) break;
		store.delete(oldest);
	}
	return value;
}

/** für Tests */
export function clearOrgDerived(): void {
	store.clear();
}
