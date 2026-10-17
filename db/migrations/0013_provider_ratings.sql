CREATE TABLE "provider_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"criteria" jsonb NOT NULL,
	"area_weights" jsonb NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"general_score" double precision,
	"security_score" double precision,
	"total_score" double precision,
	"level" text,
	"traffic" text,
	"measures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text DEFAULT 'open' NOT NULL,
	"decision_note" text,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"approval_request_id" uuid,
	"next_assessment_at" date,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_ratings_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "provider_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "supplier_method" jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "provider_ratings" ADD CONSTRAINT "provider_ratings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_ratings" ADD CONSTRAINT "provider_ratings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_ratings" ADD CONSTRAINT "provider_ratings_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_ratings" ADD CONSTRAINT "provider_ratings_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_ratings_provider_idx" ON "provider_ratings" USING btree ("provider_id");--> statement-breakpoint
CREATE POLICY "provider_ratings_org" ON "provider_ratings" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "provider_ratings" FORCE ROW LEVEL SECURITY;
