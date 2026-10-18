ALTER TABLE "control_tests" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD COLUMN "attachment_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "template_key" text;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;