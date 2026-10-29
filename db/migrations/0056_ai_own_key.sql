CREATE TABLE "ai_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key_enc" text NOT NULL,
	"key_hint" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_ok" text
);
--> statement-breakpoint
ALTER TABLE "ai_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_org_accounts" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_org_accounts" ADD COLUMN "ai_mode" text DEFAULT 'assist' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_org_accounts" ADD COLUMN "ai_max_class" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "ai_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credentials" ADD CONSTRAINT "ai_credentials_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_credentials_org_idx" ON "ai_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "ai_credentials_org" ON "ai_credentials" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "ai_credentials" FORCE ROW LEVEL SECURITY;