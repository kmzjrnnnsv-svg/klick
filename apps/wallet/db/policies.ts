import { sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

// RLS-Bausteine von both.money. Org-Tabellen nutzen orgPolicy aus db/rls.ts
// (organization_id = app_current_org() or app_is_platform()). Dazu kommt die
// Person: app_current_user() aus set_config('app.user_id', …, true) — nur so
// sieht ein Konto beim Anmelden seine eigenen Mitgliedschaften, ohne dass
// eine Org gesetzt ist. Funktionen legt die Migration 0000_init an.

export const ORG = sql`organization_id = app_current_org() or app_is_platform()`;
export const OWN_USER = sql`user_id = app_current_user()`;

// Mitgliedschaften: Org (alles) oder eigene Zeilen (nur lesen)
export function memberPolicies(table: string) {
	return [
		pgPolicy(`${table}_org`, {
			for: "all",
			to: "public",
			using: ORG,
			withCheck: ORG,
		}),
		pgPolicy(`${table}_self`, { for: "select", to: "public", using: OWN_USER }),
	];
}
