CREATE TABLE "storage_purge_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"purged_at" timestamp with time zone,
	CONSTRAINT "storage_purge_queue_organizationId_storageKey_unique" UNIQUE("organization_id","storage_key")
);
--> statement-breakpoint
ALTER TABLE "storage_purge_queue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "dlp" jsonb;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "dlp_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_purge_queue" ADD CONSTRAINT "storage_purge_queue_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_purge_queue" ADD CONSTRAINT "storage_purge_queue_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_purge_due_idx" ON "storage_purge_queue" USING btree ("purge_after");--> statement-breakpoint
CREATE POLICY "storage_purge_queue_org" ON "storage_purge_queue" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "storage_purge_queue" FORCE ROW LEVEL SECURITY;