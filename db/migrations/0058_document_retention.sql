ALTER TABLE "document_versions" ADD COLUMN "retain_until" date;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "destroyed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "destroyed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "destruction_note" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "external_source" jsonb;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_destroyed_by_user_id_user_id_fk" FOREIGN KEY ("destroyed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- AP9.3: Vernichtung einer Fassung nach Ablauf der Aufbewahrung. Erlaubt ist
-- genau ein Übergang: destroyed_at wird gesetzt, Text und Datei werden leer,
-- Prüfsumme, Notiz und Nummer bleiben. Nur für Fassungen, die gegolten haben
-- und nicht mehr gelten (zurückgezogen oder durch eine spätere
-- Veröffentlichung abgelöst). Danach bleibt die Vernichtung bestehen.
CREATE OR REPLACE FUNCTION document_versions_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL OR OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'document_versions: approved or published version is immutable' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.destroyed_at IS NOT NULL AND (
    NEW.destroyed_at IS DISTINCT FROM OLD.destroyed_at
    OR NEW.destroyed_by_user_id IS DISTINCT FROM OLD.destroyed_by_user_id
    OR NEW.destruction_note IS DISTINCT FROM OLD.destruction_note
  ) THEN
    RAISE EXCEPTION 'document_versions: destruction is set once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.destroyed_at IS NULL AND NEW.destroyed_at IS NOT NULL THEN
    IF OLD.published_at IS NULL THEN
      RAISE EXCEPTION 'document_versions: only versions that were in force can be destroyed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.retired_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM document_versions n
      WHERE n.document_id = OLD.document_id
        AND n.published_at IS NOT NULL
        AND n.published_at > OLD.published_at
    ) THEN
      RAISE EXCEPTION 'document_versions: version in force cannot be destroyed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.body_markdown IS NOT NULL OR NEW.file_evidence_id IS NOT NULL
      OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
      OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.document_id IS DISTINCT FROM OLD.document_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
      RAISE EXCEPTION 'document_versions: destruction only clears text and file' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.approved_at IS NOT NULL OR OLD.published_at IS NOT NULL) AND (
    NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.file_evidence_id IS DISTINCT FROM OLD.file_evidence_id
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  ) THEN
    RAISE EXCEPTION 'document_versions: approved or published version is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.approved_at IS NOT NULL AND (
    NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
  ) THEN
    RAISE EXCEPTION 'document_versions: approval is set once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'document_versions: publication is set once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION 'document_versions: retirement is set once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
