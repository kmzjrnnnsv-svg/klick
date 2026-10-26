CREATE TABLE "policy_portals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"org_name" text NOT NULL,
	"domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"session_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_portals_organizationId_unique" UNIQUE("organization_id"),
	CONSTRAINT "policy_portals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "policy_portals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "policy_reader_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reader_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_reader_acknowledgements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "policy_readers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_readers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_portals" ADD CONSTRAINT "policy_portals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_reader_acknowledgements" ADD CONSTRAINT "policy_reader_acknowledgements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_reader_acknowledgements" ADD CONSTRAINT "policy_reader_acknowledgements_reader_id_policy_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "public"."policy_readers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_reader_acknowledgements" ADD CONSTRAINT "policy_reader_acknowledgements_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_readers" ADD CONSTRAINT "policy_readers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "policy_reader_ack_uq" ON "policy_reader_acknowledgements" USING btree ("reader_id","document_version_id");--> statement-breakpoint
CREATE INDEX "policy_reader_ack_version_idx" ON "policy_reader_acknowledgements" USING btree ("document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_readers_org_email_uq" ON "policy_readers" USING btree ("organization_id","email");--> statement-breakpoint
CREATE POLICY "policy_portals_org" ON "policy_portals" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "policy_portals_public" ON "policy_portals" AS PERMISSIVE FOR SELECT TO public USING (enabled);--> statement-breakpoint
CREATE POLICY "policy_reader_acknowledgements_org" ON "policy_reader_acknowledgements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "policy_readers_org" ON "policy_readers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "policy_portals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_readers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "policy_reader_acknowledgements" FORCE ROW LEVEL SECURITY;
