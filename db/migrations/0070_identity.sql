CREATE TABLE "access_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"account_id" uuid,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewer_user_id" uuid,
	"decision" text,
	"note" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"task_id" uuid
);
--> statement-breakpoint
ALTER TABLE "access_review_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "access_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"due_at" date,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"evidence_id" uuid,
	"control_test_id" uuid
);
--> statement-breakpoint
ALTER TABLE "access_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_top_admin" boolean DEFAULT false NOT NULL,
	"admin_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mfa_registered" boolean,
	"last_sign_in_at" timestamp with time zone,
	"created_at_source" timestamp with time zone,
	"leave_at" timestamp with time zone,
	"matched_user_id" uuid,
	"match_mode" text DEFAULT 'auto' NOT NULL,
	"marked_left_at" timestamp with time zone,
	"marked_left_by" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"missing_since" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"result" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_result" text,
	"last_test_id" uuid
);
--> statement-breakpoint
ALTER TABLE "identity_check_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
ALTER TABLE "identity_exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "identity_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"tenant_key" text NOT NULL,
	"status" text DEFAULT 'pending_consent' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_enc" text,
	"consent_nonce_hash" text,
	"consent_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_sync_ok" boolean,
	"account_count" integer,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "identity_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_review_id_access_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."access_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_account_id_identity_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_review_items" ADD CONSTRAINT "access_review_items_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_source_id_identity_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."identity_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_reviews" ADD CONSTRAINT "access_reviews_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_source_id_identity_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."identity_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_matched_user_id_user_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_marked_left_by_user_id_fk" FOREIGN KEY ("marked_left_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_check_results" ADD CONSTRAINT "identity_check_results_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_exceptions" ADD CONSTRAINT "identity_exceptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_exceptions" ADD CONSTRAINT "identity_exceptions_account_id_identity_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_exceptions" ADD CONSTRAINT "identity_exceptions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_exceptions" ADD CONSTRAINT "identity_exceptions_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sources" ADD CONSTRAINT "identity_sources_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_sources" ADD CONSTRAINT "identity_sources_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_review_items_org_review_idx" ON "access_review_items" USING btree ("organization_id","review_id");--> statement-breakpoint
CREATE INDEX "access_reviews_org_idx" ON "access_reviews" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_accounts_source_ext_uq" ON "identity_accounts" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "identity_accounts_org_idx" ON "identity_accounts" USING btree ("organization_id","source_id");--> statement-breakpoint
CREATE INDEX "identity_accounts_org_user_idx" ON "identity_accounts" USING btree ("organization_id","matched_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_check_results_org_key_uq" ON "identity_check_results" USING btree ("organization_id","check_key");--> statement-breakpoint
CREATE INDEX "identity_exceptions_org_account_idx" ON "identity_exceptions" USING btree ("organization_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_sources_org_provider_uq" ON "identity_sources" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_sources_tenant_uq" ON "identity_sources" USING btree ("provider",lower("tenant_key")) WHERE "identity_sources"."status" <> 'pending_consent';--> statement-breakpoint
CREATE POLICY "access_review_items_org" ON "access_review_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "access_reviews_org" ON "access_reviews" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "identity_accounts_org" ON "identity_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "identity_check_results_org" ON "identity_check_results" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "identity_exceptions_org" ON "identity_exceptions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "identity_sources_org" ON "identity_sources" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "identity_sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_exceptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "identity_check_results" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_review_items" FORCE ROW LEVEL SECURITY;
