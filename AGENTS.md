# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Mandanten-Kontext ist Pflicht

Fachcode greift **nie** direkt auf `@/db` (`globalDb`) zu — Biome blockt den Import außerhalb von
`lib/db`, `lib/auth`, `lib/jobs`, `lib/audit.ts`, `db`, `scripts`, `tests`. Jede Org-Query läuft in
`readOrg()`/`withOrg()`/`mutateOrg()` aus `lib/db/with-org.ts`; jede exportierte Funktion in einer
`"use server"`-Datei ruft zuerst einen Guard aus `lib/auth/guards.ts` (`requireOrg`, `requireStepUp`,
`requirePlatformAdmin`). Mutationen schreiben ihren Audit-Eintrag als letzte Anweisung derselben
Transaktion (`mutateOrg`).

# Schema-Types nie redeklarieren

Shapes aus `db/schema/*` (z. B. `Risk`, `Document`, `EntityKind`, `Domain`) und `lib/compliance/catalog/types.ts`
werden importiert, nicht in Komponenten nachgetippt. Schmalere Sub-Shapes über `Pick<…>`.

# Neue Tabelle? Dann auch RLS

Jede Tabelle mit `organization_id` bekommt `orgPolicy("<table>")` und `.enableRLS()`; die Migration
ergänzt `FORCE ROW LEVEL SECURITY` (siehe `scripts/wrap-pivot-migration.sh` für das Muster).
`tests/isolation.matrix.test.ts` schlägt sonst fehl.

# Vor Commit: `pnpm preflight`

`pnpm preflight` = `pnpm typecheck && pnpm lint && pnpm test`. CI (`.github/workflows/ci.yml`) fährt
dasselbe plus RLS-Integrationstests gegen Postgres, `pnpm audit`, OSV, gitleaks, CodeQL. Wenn CI rot
ist, auf dem Server **kein** `pnpm release`.
