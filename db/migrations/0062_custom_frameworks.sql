CREATE TABLE "custom_framework_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_framework_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"issuer" text,
	"origin" text NOT NULL,
	"description" text,
	"source_url" text,
	"exclusion_allowed" boolean DEFAULT false NOT NULL,
	"exclusion_label" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"copied_from" text,
	"activated_at" timestamp with time zone,
	"activated_by" uuid,
	"retired_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_requirement_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"control_code" text NOT NULL,
	"coverage" text DEFAULT 'full' NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "custom_requirement_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"section_code" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"domain" text NOT NULL,
	"guidance" text,
	"audit_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_framework_sections" ADD CONSTRAINT "custom_framework_sections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_framework_sections" ADD CONSTRAINT "custom_framework_sections_framework_id_custom_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."custom_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_frameworks" ADD CONSTRAINT "custom_frameworks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_frameworks" ADD CONSTRAINT "custom_frameworks_activated_by_user_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_frameworks" ADD CONSTRAINT "custom_frameworks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requirement_controls" ADD CONSTRAINT "custom_requirement_controls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requirement_controls" ADD CONSTRAINT "custom_requirement_controls_requirement_id_custom_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."custom_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requirements" ADD CONSTRAINT "custom_requirements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_requirements" ADD CONSTRAINT "custom_requirements_framework_id_custom_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."custom_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_framework_sections_uq" ON "custom_framework_sections" USING btree ("framework_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_frameworks_org_key_uq" ON "custom_frameworks" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_requirement_controls_uq" ON "custom_requirement_controls" USING btree ("requirement_id","control_code");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_requirements_uq" ON "custom_requirements" USING btree ("framework_id","code");--> statement-breakpoint
CREATE INDEX "custom_requirements_org_idx" ON "custom_requirements" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "custom_framework_sections_org" ON "custom_framework_sections" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "custom_frameworks_org" ON "custom_frameworks" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "custom_requirement_controls_org" ON "custom_requirement_controls" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "custom_requirements_org" ON "custom_requirements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "custom_frameworks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_framework_sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_requirements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_requirement_controls" FORCE ROW LEVEL SECURITY;
