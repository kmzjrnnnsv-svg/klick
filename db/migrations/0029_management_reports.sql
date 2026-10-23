CREATE TABLE "management_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"author_function" text,
	"author_user_id" uuid,
	"summary" text,
	"measures" text,
	"figures" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "management_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "management_reports" ADD CONSTRAINT "management_reports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reports" ADD CONSTRAINT "management_reports_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "management_reports_org_idx" ON "management_reports" USING btree ("organization_id","period_to");--> statement-breakpoint
CREATE POLICY "management_reports_org" ON "management_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "management_reports" FORCE ROW LEVEL SECURITY;