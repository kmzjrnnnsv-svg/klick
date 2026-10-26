ALTER TABLE "evidence" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "superseded_by_id" uuid;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_superseded_by_id_evidence_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_current_idx" ON "evidence" USING btree ("organization_id") WHERE "evidence"."superseded_at" is null;--> statement-breakpoint
-- Bestand: eine Fassung mit Nachfolgerin (supersedes_id) gilt als ersetzt,
-- und zwar durch die erste Nachfolgerin
UPDATE "evidence" o
SET "superseded_at" = n."created_at", "superseded_by_id" = n."id"
FROM (
	SELECT DISTINCT ON ("supersedes_id") "id", "supersedes_id", "created_at"
	FROM "evidence"
	WHERE "supersedes_id" IS NOT NULL
	ORDER BY "supersedes_id", "created_at" ASC
) n
WHERE o."id" = n."supersedes_id" AND o."superseded_at" IS NULL;--> statement-breakpoint
-- Wird die Nachfolgerin gelöscht, gilt die Vorgängerin wieder (nicht bei
-- Kaskaden, etwa beim Löschen der Organisation)
CREATE OR REPLACE FUNCTION evidence_release_superseded() RETURNS trigger AS $$
BEGIN
	IF pg_trigger_depth() > 1 THEN
		RETURN OLD;
	END IF;
	UPDATE "evidence"
	SET "superseded_at" = NULL, "superseded_by_id" = NULL
	WHERE "superseded_by_id" = OLD."id";
	RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER evidence_release_superseded
	BEFORE DELETE ON "evidence"
	FOR EACH ROW EXECUTE FUNCTION evidence_release_superseded();
