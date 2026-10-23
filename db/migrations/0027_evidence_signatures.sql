CREATE TABLE "evidence_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"sha256" text NOT NULL,
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
	"batch_id" uuid,
	"merkle_root" text,
	"merkle_proof" jsonb,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_signatures_nonce_unique" UNIQUE("organization_id","nonce","evidence_id")
);
--> statement-breakpoint
ALTER TABLE "evidence_signatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_signatures" ADD CONSTRAINT "evidence_signatures_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_signatures" ADD CONSTRAINT "evidence_signatures_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_signatures_evidence_idx" ON "evidence_signatures" USING btree ("evidence_id");--> statement-breakpoint
CREATE POLICY "evidence_signatures_select" ON "evidence_signatures" AS PERMISSIVE FOR SELECT TO public USING (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "evidence_signatures_insert" ON "evidence_signatures" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "evidence_signatures" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klick_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "evidence_signatures" FROM klick_app;
  END IF;
END $$;
