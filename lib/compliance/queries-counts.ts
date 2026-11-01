import { sql } from "drizzle-orm";
import type { OrgTx } from "@/lib/db/with-org";

// Zahlen für Übersichten (Leistung bei wachsenden Daten): count in SQL über
// Indizes mit Organisation vorn, statt ganze Register zu laden und in JS zu
// zählen.

export async function countOpenTasks(tx: OrgTx, orgId: string) {
	const rows = await tx.execute<{ n: number }>(sql`
		select count(*)::int as n from tasks
		where organization_id = ${orgId} and status in ('todo', 'doing', 'blocked')`);
	return rows[0]?.n ?? 0;
}

// Umgesetzte Controls ohne gültigen Nachweis (ersetzte Fassungen zählen nicht)
export async function implementedWithoutEvidenceCount(
	tx: OrgTx,
	orgId: string,
) {
	const rows = await tx.execute<{ n: number }>(sql`
		select count(*)::int as n from control_implementations ci
		where ci.organization_id = ${orgId} and ci.status = 'implemented'
		  and not exists (
		    -- evidence:any-version — nur aktuelle Fassungen (superseded_at is null)
		    select 1 from control_evidence ce
		    join evidence e on e.id = ce.evidence_id
		    where ce.organization_id = ${orgId} and ce.implementation_id = ci.id
		      and e.superseded_at is null)`);
	return rows[0]?.n ?? 0;
}
