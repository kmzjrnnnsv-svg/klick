CREATE TABLE "access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip" text,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "security_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"tool" text NOT NULL,
	"rule_id" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"target" text,
	"location" text,
	"cwe" text,
	"cve" text,
	"cvss" real,
	"package_name" text,
	"package_version" text,
	"fixed_version" text,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"status_note" text,
	"accepted_until" date,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"control_code" text,
	"product_id" uuid,
	"last_scan_id" uuid,
	"nonconformity_id" uuid,
	"task_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_findings_organizationId_fingerprint_unique" UNIQUE("organization_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "security_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "security_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"source" text NOT NULL,
	"tool_name" text,
	"target" text,
	"product_id" uuid,
	"evidence_id" uuid,
	"full_scan" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"error" text,
	"counts" jsonb,
	"token_id" uuid,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "security_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_last_scan_id_security_scans_id_fk" FOREIGN KEY ("last_scan_id") REFERENCES "public"."security_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_token_id_access_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_tokens_org_idx" ON "access_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "security_findings_org_status_idx" ON "security_findings" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "security_scans_org_idx" ON "security_scans" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE POLICY "access_tokens_org" ON "access_tokens" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "access_tokens_by_hash" ON "access_tokens" AS PERMISSIVE FOR SELECT TO public USING (token_hash = nullif(current_setting('app.token_hash', true), ''));--> statement-breakpoint
CREATE POLICY "security_findings_org" ON "security_findings" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "security_scans_org" ON "security_scans" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "access_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_scans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_findings" FORCE ROW LEVEL SECURITY;