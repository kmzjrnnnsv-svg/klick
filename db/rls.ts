import { is, sql } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";
import { getTableConfig, PgTable, pgPolicy } from "drizzle-orm/pg-core";

// Row-Level-Security-Bausteine (ISO A.8.3/A.5.15, DORA Art. 9).
//
// Jede Mandanten-Tabelle trägt organization_id und genau diese Policy. Der
// Kontext kommt aus set_config('app.org_id', …, true) — transaktionslokal —
// bzw. set_config('app.scope', 'platform', true) für den auditierten
// Plattform-Zugriff (lib/db/with-org.ts). Die Funktionen app_current_org()
// und app_is_platform() legt die Migration 0000_pivot (Block A) an.
//
// drizzle-kit emittiert ENABLE ROW LEVEL SECURITY; FORCE (gilt auch für den
// Tabellen-Owner) ergänzt Block C der Migration.

const ORG_PREDICATE = sql`organization_id = app_current_org() or app_is_platform()`;

export function orgPolicy(table: string) {
	return pgPolicy(`${table}_org`, {
		for: "all",
		to: "public",
		using: ORG_PREDICATE,
		withCheck: ORG_PREDICATE,
	});
}

// audit_log: nur SELECT + INSERT, nie UPDATE/DELETE (zusätzlich Trigger).
export function appendOnlyOrgPolicies(table: string) {
	return [
		pgPolicy(`${table}_select`, {
			for: "select",
			to: "public",
			using: ORG_PREDICATE,
		}),
		pgPolicy(`${table}_insert`, {
			for: "insert",
			to: "public",
			withCheck: ORG_PREDICATE,
		}),
	];
}

export type RlsCheck = {
	table: string;
	hasOrgColumn: boolean;
	rlsEnabled: boolean;
	policyCount: number;
	ok: boolean;
};

// Schema-Lint: jede Tabelle mit organization_id muss RLS + ≥ 1 Policy haben.
// Ausnahmen (Better-Auth-Tabellen, die der Adapter ohne Org-Kontext liest)
// werden explizit übergeben und müssen begründet sein.
export function checkRls(
	tables: Record<string, unknown>,
	allowWithoutRls: ReadonlySet<string> = new Set(),
): RlsCheck[] {
	// Spaltennamen entstehen erst beim Query-Bau aus den Keys (db/index.ts:
	// casing "snake_case"); getTableConfig liefert bei impliziten Namen den
	// TS-Key. Dieselbe Casing-Regel löst beides auf den DB-Namen auf.
	const casing = new CasingCache("snake_case");
	const out: RlsCheck[] = [];
	for (const value of Object.values(tables)) {
		if (!isPgTable(value)) continue;
		const cfg = getTableConfig(value);
		const hasOrgColumn = cfg.columns.some(
			(c) => casing.getColumnCasing(c) === "organization_id",
		);
		if (!hasOrgColumn) continue;
		const policyCount = cfg.policies.length;
		const rlsEnabled = cfg.enableRLS || policyCount > 0;
		const ok = allowWithoutRls.has(cfg.name) || (rlsEnabled && policyCount > 0);
		out.push({ table: cfg.name, hasOrgColumn, rlsEnabled, policyCount, ok });
	}
	return out;
}

export function assertAllOrgTablesHavePolicy(
	tables: Record<string, unknown>,
	allowWithoutRls?: ReadonlySet<string>,
): void {
	const failing = checkRls(tables, allowWithoutRls).filter((c) => !c.ok);
	if (failing.length > 0) {
		throw new Error(
			`Tabellen mit organization_id ohne RLS-Policy: ${failing
				.map((f) => f.table)
				.join(", ")}`,
		);
	}
}

function isPgTable(value: unknown): value is PgTable {
	return is(value, PgTable);
}
