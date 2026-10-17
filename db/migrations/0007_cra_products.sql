CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'software' NOT NULL,
	"role" text DEFAULT 'manufacturer' NOT NULL,
	"version" text,
	"cra_in_scope" boolean,
	"scope_reason" text,
	"cra_class" text DEFAULT 'default' NOT NULL,
	"class_reason" text,
	"is_foss" boolean DEFAULT false NOT NULL,
	"harmonised_standards" boolean DEFAULT false NOT NULL,
	"placed_on_market_at" date,
	"support_until" date,
	"support_reason" text,
	"vuln_contact" text,
	"sbom_evidence_id" uuid,
	"sbom_summary" jsonb,
	"risk_document_id" uuid,
	"tech_doc_document_id" uuid,
	"declaration_at" date,
	"ce_marked" boolean DEFAULT false NOT NULL,
	"notified_body" text,
	"status" text DEFAULT 'development' NOT NULL,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "cra_criteria" jsonb;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "mitigation_available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sbom_evidence_id_evidence_id_fk" FOREIGN KEY ("sbom_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_risk_document_id_documents_id_fk" FOREIGN KEY ("risk_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tech_doc_document_id_documents_id_fk" FOREIGN KEY ("tech_doc_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_org_status_idx" ON "products" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "products_org" ON "products" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;