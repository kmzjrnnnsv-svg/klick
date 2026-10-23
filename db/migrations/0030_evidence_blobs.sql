CREATE TABLE "evidence_blobs" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"envelope" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_blobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_blobs" ADD CONSTRAINT "evidence_blobs_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_blobs" ADD CONSTRAINT "evidence_blobs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_blobs_org_idx" ON "evidence_blobs" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "evidence_blobs_org" ON "evidence_blobs" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "evidence_blobs" FORCE ROW LEVEL SECURITY;
