CREATE TABLE "sso_probes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"request_id" text NOT NULL,
	"requested_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sso_probes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sso_provider_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"vendor" text,
	"metadata_url" text,
	"cert_fingerprints" text,
	"cert_not_after" timestamp with time zone,
	"next_metadata" text,
	"next_cert_fingerprints" text,
	"next_cert_not_after" timestamp with time zone,
	"next_seen_at" timestamp with time zone,
	"last_fetch_at" timestamp with time zone,
	"last_fetch_error" text,
	"probe_ok_at" timestamp with time zone,
	"probe_ok_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sso_provider_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sso_setup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"provider_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"metadata_url" text,
	"metadata_xml" text,
	"attributes" jsonb,
	"contact_name" text,
	"submitted_at" timestamp with time zone,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sso_setup_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_probes" ADD CONSTRAINT "sso_probes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_probes" ADD CONSTRAINT "sso_probes_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider_states" ADD CONSTRAINT "sso_provider_states_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider_states" ADD CONSTRAINT "sso_provider_states_probe_ok_by_user_id_fk" FOREIGN KEY ("probe_ok_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_setup_requests" ADD CONSTRAINT "sso_setup_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_setup_requests" ADD CONSTRAINT "sso_setup_requests_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_probes_request_uq" ON "sso_probes" USING btree ("provider_id","request_id");--> statement-breakpoint
CREATE INDEX "sso_probes_org_idx" ON "sso_probes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_states_org_provider_uq" ON "sso_provider_states" USING btree ("organization_id","provider_id");--> statement-breakpoint
CREATE INDEX "sso_setup_requests_org_idx" ON "sso_setup_requests" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "sso_probes_org" ON "sso_probes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "sso_provider_states_org" ON "sso_provider_states" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "sso_setup_requests_org" ON "sso_setup_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "sso_probes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_provider_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sso_setup_requests" FORCE ROW LEVEL SECURITY;
