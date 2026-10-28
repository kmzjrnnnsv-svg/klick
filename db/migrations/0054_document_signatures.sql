CREATE TABLE "document_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"version" text NOT NULL,
	"content_sha256" text NOT NULL,
	"approval_request_id" uuid,
	"signer_user_id" uuid NOT NULL,
	"signer_name" text NOT NULL,
	"function" text,
	"purpose" text NOT NULL,
	"sign_text" text NOT NULL,
	"nonce" text NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"authenticator_data" text NOT NULL,
	"client_data_json" text NOT NULL,
	"signature" text NOT NULL,
	"user_verified" boolean NOT NULL,
	"backup_eligible" boolean NOT NULL,
	"backup_state" boolean NOT NULL,
	"sign_count" integer NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_signatures_nonce_unique" UNIQUE("organization_id","nonce")
);
--> statement-breakpoint
ALTER TABLE "document_signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signatures" ADD CONSTRAINT "document_signatures_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_signatures_version_idx" ON "document_signatures" USING btree ("version_id");--> statement-breakpoint
CREATE POLICY "document_signatures_select" ON "document_signatures" AS PERMISSIVE FOR SELECT TO public USING (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_signatures_insert" ON "document_signatures" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "document_signatures" FORCE ROW LEVEL SECURITY;
