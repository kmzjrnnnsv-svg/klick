#!/usr/bin/env bash
# Umhüllt die von drizzle-kit generierte 0000_pivot.sql mit Block A (Chain-
# Reset + RLS-Funktionen) und Block C (FORCE RLS, Carry-over, Audit-Trigger).
# Idempotent: erkennt ein bereits umhülltes File und bricht ab.
set -euo pipefail
F=db/migrations/0000_pivot.sql
grep -q "Block A — Chain-Reset" "$F" && { echo "bereits umhüllt"; exit 0; }
TABLES=$(grep -oP 'ALTER TABLE "\K[a-z_]+(?=" ENABLE ROW LEVEL SECURITY)' "$F" | sort -u)
TMP=$(mktemp)
{
cat <<'SQL'
-- ═══════════════════════════════════════════════════════════════════════════
-- Block A — Chain-Reset: Alt-Daten sichern, Recruiting-Schema entfernen,
-- RLS-Hilfsfunktionen anlegen. Muss VOR den generierten CREATEs laufen,
-- weil audit_log/notifications/cms_pages in Alt und Neu existieren und die
-- generierten CREATE POLICY-Statements app_current_org() referenzieren.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'CREATE TEMP TABLE legacy_admins AS SELECT id, lower(email) AS email, name, email_verified, created_at FROM public.users WHERE role = ''admin''';
  ELSE
    CREATE TEMP TABLE legacy_admins (id text, email text, name text, email_verified timestamp, created_at timestamp);
  END IF;
  IF to_regclass('public.cms_pages') IS NOT NULL THEN
    EXECUTE 'CREATE TEMP TABLE legacy_cms AS SELECT slug, title, body, updated_at FROM public.cms_pages';
  ELSE
    CREATE TEMP TABLE legacy_cms (slug text, title text, body text, updated_at timestamp);
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "accounts","agency_collaborations","agency_members","ai_evaluations","application_events","application_messages","application_notes","applications","assessment_responses","audit_log","candidate_profiles","cms_pages","collaboration_candidate_proposals","commission_events","disclosures","diversity_responses","employers","favorites","geocode_cache","hiring_process_templates","interests","job_assessment_questions","job_assessments","job_mandates","job_questions","job_stages","jobs","matches","notifications","offers","outcomes","reference_checks","reference_disclosures","saved_searches","sessions","stage_ratings","template_stages","tenants","users","vault_items","verification_tokens","verifications" CASCADE;
--> statement-breakpoint
DO $$ BEGIN
  -- Alt-pgboss-Schema nur entfernen, wenn es uns gehört (Prod: Migrator = alte Rolle).
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname = 'pgboss' AND r.rolname = current_user) THEN
    EXECUTE 'DROP SCHEMA pgboss CASCADE';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
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
-- Block C — FORCE RLS (gilt auch für den Tabellen-Owner), Carry-over der
-- Admins und CMS-Texte, Append-only-Trigger für audit_log.
-- ═══════════════════════════════════════════════════════════════════════════
SQL
for t in $TABLES; do echo "ALTER TABLE \"$t\" FORCE ROW LEVEL SECURITY;--> statement-breakpoint"; done
cat <<'SQL'
INSERT INTO "user" (id, email, name, email_verified, role, created_at, updated_at)
  SELECT id::uuid, email, coalesce(name, split_part(email, '@', 1)), email_verified IS NOT NULL, 'admin', coalesce(created_at, now()), now()
  FROM legacy_admins
  ON CONFLICT (email) DO NOTHING;
--> statement-breakpoint
INSERT INTO "cms_pages" (slug, title, body, updated_at)
  SELECT slug, title, body, coalesce(updated_at, now()) FROM legacy_cms
  ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
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
echo "✔ $F umhüllt ($(echo "$TABLES" | wc -l) Org-Tabellen mit FORCE RLS)"
