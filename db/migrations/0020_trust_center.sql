CREATE TABLE "trust_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"reason" text,
	"nda_accepted_at" timestamp with time zone NOT NULL,
	"nda_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"note" text,
	"token_id" uuid,
	"expires_at" timestamp with time zone,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trust_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"settings" jsonb NOT NULL,
	"snapshot" jsonb,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_centers_organizationId_unique" UNIQUE("organization_id"),
	CONSTRAINT "trust_centers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "trust_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_access_requests" ADD CONSTRAINT "trust_access_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_access_requests" ADD CONSTRAINT "trust_access_requests_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_access_requests" ADD CONSTRAINT "trust_access_requests_token_id_access_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_centers" ADD CONSTRAINT "trust_centers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_centers" ADD CONSTRAINT "trust_centers_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trust_access_requests_org_status_idx" ON "trust_access_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE POLICY "trust_access_requests_org" ON "trust_access_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "trust_centers_org" ON "trust_centers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "trust_centers_public" ON "trust_centers" AS PERMISSIVE FOR SELECT TO public USING (published);--> statement-breakpoint
ALTER TABLE "trust_centers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trust_access_requests" FORCE ROW LEVEL SECURITY;