CREATE TABLE "bcm_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid,
	"site_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"planned_at" date,
	"scenario" text DEFAULT '' NOT NULL,
	"script" jsonb NOT NULL,
	"participants" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"recovery_minutes" integer,
	"data_loss_minutes" integer,
	"plan_version" integer,
	"lessons" text DEFAULT '' NOT NULL,
	"measures" jsonb NOT NULL,
	"result" text,
	"control_test_id" uuid,
	"created_by" uuid,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bcm_exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_control_test_id_control_tests_id_fk" FOREIGN KEY ("control_test_id") REFERENCES "public"."control_tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bcm_exercises" ADD CONSTRAINT "bcm_exercises_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bcm_exercises_org_process_idx" ON "bcm_exercises" USING btree ("organization_id","process_id");--> statement-breakpoint
CREATE POLICY "bcm_exercises_org" ON "bcm_exercises" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "bcm_exercises" FORCE ROW LEVEL SECURITY;