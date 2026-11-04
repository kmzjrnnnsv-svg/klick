CREATE TABLE "bcm_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" uuid,
	"review_at" date,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bcm_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bcm_plans" ADD CONSTRAINT "bcm_plans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_plans" ADD CONSTRAINT "bcm_plans_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_plans" ADD CONSTRAINT "bcm_plans_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_plans" ADD CONSTRAINT "bcm_plans_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bcm_plans_org_process_uq" ON "bcm_plans" USING btree ("organization_id","process_id");--> statement-breakpoint
CREATE INDEX "bcm_plans_process_idx" ON "bcm_plans" USING btree ("process_id");--> statement-breakpoint
CREATE POLICY "bcm_plans_org" ON "bcm_plans" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "bcm_plans" FORCE ROW LEVEL SECURITY;