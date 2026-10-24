#!/usr/bin/env bash
# Umhüllt die von drizzle-kit erzeugte 0000_init.sql von both.money:
# Block A — nur Datenbank wallet/wallet_test, RLS-Funktionen anlegen
# Block C — FORCE RLS für alle Tabellen mit RLS, audit_log nur anhängend.
# Idempotent: erkennt ein bereits umhülltes File und bricht ab.
set -euo pipefail
F=apps/wallet/db/migrations/0000_init.sql
grep -q "Block A — both.money" "$F" && { echo "bereits umhüllt"; exit 0; }
TABLES=$(grep -oP 'ALTER TABLE "\K[a-z_]+(?=" ENABLE ROW LEVEL SECURITY)' "$F" | sort -u)
TMP=$(mktemp)
{
cat <<'SQL'
-- ═══════════════════════════════════════════════════════════════════════════
-- Block A — both.money: nur in der eigenen Datenbank, RLS-Funktionen
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF current_database() NOT IN ('wallet', 'wallet_test') THEN
    RAISE EXCEPTION 'both.money-Migration verweigert: Datenbank % ist nicht wallet/wallet_test', current_database();
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.scope', true) = 'platform'
$$;
--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Block B — generiert von drizzle-kit (unverändert)
-- ═══════════════════════════════════════════════════════════════════════════
SQL
cat "$F"
cat <<'SQL'
--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Block C — FORCE RLS (gilt auch für den Tabellen-Owner), audit_log nur
-- anhängend
-- ═══════════════════════════════════════════════════════════════════════════
SQL
for t in $TABLES; do echo "ALTER TABLE \"$t\" FORCE ROW LEVEL SECURITY;--> statement-breakpoint"; done
cat <<'SQL'
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutation BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
SQL
} > "$TMP"
mv "$TMP" "$F"
chmod 644 "$F"
echo "umhüllt: $(echo "$TABLES" | wc -w) Tabellen mit FORCE RLS"
