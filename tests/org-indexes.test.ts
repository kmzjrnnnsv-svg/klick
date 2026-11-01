import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as authSchema from "@/db/auth-schema";
import * as schema from "@/db/schema";

// Leistung bei wachsenden Daten: alle Kund:innen teilen eine Datenbank. Eine
// Org-Tabelle ohne Index mit organization_id vorn lässt jede Abfrage (und
// jede RLS-Prüfung) über die Zeilen aller Orgs laufen — ein neuer Datensatz
// einer Org verlangsamt dann alle anderen. Jede Tabelle mit organization_id
// braucht deshalb einen Index oder eindeutigen Schlüssel, der mit
// organization_id beginnt, oder einen Grund auf dieser Liste.

const EXCEPTIONS: Record<string, string> = {
	// Better Auth: Zeilen je Org klein, Zugriff über eigene Indizes des Adapters
	member:
		"Better Auth, liest über user_id/organization_id-Indizes des Adapters",
	invitation: "Better Auth, wenige Zeilen je Org",
	sso_provider: "Better Auth SSO, eine Handvoll Zeilen je Org",
	session: "Better Auth, Zugriff über Token",
};

// Spalten tragen im Schema den TS-Namen (casing: snake_case wandelt erst
// beim Abfragen)
const isOrg = (name: string) =>
	name === "organization_id" || name === "organizationId";

const tables = [...Object.values(schema), ...Object.values(authSchema)].filter(
	(v): v is PgTable => v instanceof PgTable,
);

function leadsWithOrg(t: PgTable): boolean {
	const cfg = getTableConfig(t);
	const first = (cols: { name: string }[]) => isOrg(cols[0]?.name ?? "");
	// Spalte selbst ist Primärschlüssel oder eindeutig (eine Zeile je Org)
	const orgCol = cfg.columns.find((c) => isOrg(c.name));
	if (orgCol?.primary || orgCol?.isUnique) return true;
	return (
		cfg.indexes.some((i) =>
			first(i.config.columns as unknown as { name: string }[]),
		) ||
		cfg.uniqueConstraints.some((u) => first(u.columns)) ||
		first(cfg.primaryKeys.flatMap((p) => p.columns))
	);
}

describe("Index mit Organisation vorn", () => {
	const orgTables = tables.filter((t) =>
		getTableConfig(t).columns.some((c) => isOrg(c.name)),
	);

	it("findet die Org-Tabellen", () => {
		expect(orgTables.length).toBeGreaterThan(100);
	});

	it.each(
		orgTables.map((t) => [getTableConfig(t).name, t] as const),
	)("%s", (name, t) => {
		if (EXCEPTIONS[name]) return;
		expect(
			leadsWithOrg(t),
			`index("${name}_org_idx").on(t.organizationId, …) im Schema ergänzen, dann pnpm db:generate`,
		).toBe(true);
	});
});
