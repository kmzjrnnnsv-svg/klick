CREATE TABLE "security_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'pentest' NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"product_id" uuid,
	"scope" text,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"out_of_scope" text,
	"rules_of_engagement" text,
	"methodology" text,
	"tester_external" boolean DEFAULT true NOT NULL,
	"tester_name" text,
	"tester_org" text,
	"tester_email" text,
	"start_at" date,
	"end_at" date,
	"authorization_evidence_id" uuid,
	"authorized_by_user_id" uuid,
	"authorized_at" timestamp with time zone,
	"summary" text,
	"report_evidence_id" uuid,
	"delivered_at" timestamp with time zone,
	"result" text,
	"control_test_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retest_due_at" date,
	"closed_at" timestamp with time zone,
	"status_note" text,
	"owner_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_engagements_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "security_engagements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "engagement_id" uuid;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "cvss_vector" text;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "retest_status" text;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "retested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "security_findings" ADD COLUMN "retest_note" text;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_authorization_evidence_id_evidence_id_fk" FOREIGN KEY ("authorization_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_authorized_by_user_id_user_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_report_evidence_id_evidence_id_fk" FOREIGN KEY ("report_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_engagements" ADD CONSTRAINT "security_engagements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "security_engagements_org_idx" ON "security_engagements" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "security_findings" ADD CONSTRAINT "security_findings_engagement_id_security_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."security_engagements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "security_engagements_org" ON "security_engagements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "security_engagements" FORCE ROW LEVEL SECURITY;