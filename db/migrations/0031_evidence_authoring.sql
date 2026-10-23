CREATE TABLE "evidence_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"preset" text,
	"title" text NOT NULL,
	"classification" text DEFAULT 'internal' NOT NULL,
	"control_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_enc" text,
	"sheet_control" text,
	"sheet_item" text,
	"supersedes_id" uuid,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "content_enc" text;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_supersedes_id_evidence_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_drafts" ADD CONSTRAINT "evidence_drafts_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_drafts_org_idx" ON "evidence_drafts" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "evidence_drafts_org" ON "evidence_drafts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "evidence_drafts" FORCE ROW LEVEL SECURITY;
