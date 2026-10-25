ALTER TABLE "document_versions" ADD COLUMN "content_sha256" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "change_summary" text;--> statement-breakpoint
-- Zurückgezogene Dokumente: die zuletzt veröffentlichte Fassung gilt ab
-- dem letzten Stand des Dokuments nicht mehr
UPDATE "document_versions" v SET "retired_at" = d."updated_at"
  FROM "documents" d
  WHERE v."document_id" = d."id"
    AND d."status" = 'retired'
    AND v."published_at" IS NOT NULL
    AND v."retired_at" IS NULL
    AND v."published_at" = (
      SELECT max(x."published_at") FROM "document_versions" x WHERE x."document_id" = d."id"
    );
--> statement-breakpoint
-- Freigegebene oder veröffentlichte Fassungen sind unveränderlich: Text,
-- Datei, Prüfsumme und Notiz bleiben, Freigabe-, Veröffentlichungs- und
-- Rückzugszeitpunkt werden nur einmal gesetzt, Löschen ist gesperrt.
-- Kaskaden (Dokument oder Organisation gelöscht, Nachweis gelöscht) laufen
-- als Trigger einer anderen Tabelle (Tiefe > 1) und bleiben erlaubt.
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
--> statement-breakpoint
CREATE TRIGGER document_versions_frozen BEFORE UPDATE OR DELETE ON "document_versions" FOR EACH ROW EXECUTE FUNCTION document_versions_frozen();
