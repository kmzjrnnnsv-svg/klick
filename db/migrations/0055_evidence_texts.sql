CREATE TABLE "evidence_texts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" text NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"chars" integer DEFAULT 0 NOT NULL,
	"text_enc" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_texts" ADD CONSTRAINT "evidence_texts_id_evidence_id_fk" FOREIGN KEY ("id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_texts" ADD CONSTRAINT "evidence_texts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_texts_org_idx" ON "evidence_texts" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "evidence_texts_org" ON "evidence_texts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "evidence_texts" FORCE ROW LEVEL SECURITY;
