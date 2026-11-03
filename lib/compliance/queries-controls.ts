import { sql } from "drizzle-orm";
import type { OrgTx } from "@/lib/db/with-org";
import type { TestSummary } from "./controls-register";

// Tests je Control für das Register: je Umsetzung und Testart nur das letzte
// Ergebnis, gezählt in SQL (Index control_tests_org_idx). Die Antwort wächst
// mit Controls × Testarten, nicht mit der Zahl der Tests.
export async function controlTestSummary(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, TestSummary>> {
	const rows = await tx.execute<{
		implementation_id: string;
		pass: number;
		partial: number;
		fail: number;
	}>(sql`
		select implementation_id,
		       count(*) filter (where result = 'pass')::int as pass,
		       count(*) filter (where result = 'partial')::int as partial,
		       count(*) filter (where result = 'fail')::int as fail
		from (
		  select distinct on (implementation_id, method) implementation_id, result
		  from control_tests
		  where organization_id = ${orgId}
		    and implementation_id is not null
		    and result is not null
		  order by implementation_id, method, tested_at desc nulls last, created_at desc
		) latest
		group by implementation_id`);
	return new Map(
		rows.map((r) => [
			r.implementation_id,
			{ pass: r.pass, partial: r.partial, fail: r.fail },
		]),
	);
}
