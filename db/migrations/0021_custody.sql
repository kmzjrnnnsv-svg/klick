CREATE TABLE "custody_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"lines" jsonb NOT NULL,
	"status" text DEFAULT 'matched' NOT NULL,
	"shortfall" boolean DEFAULT false NOT NULL,
	"explanation" text,
	"prepared_by_user_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"nonconformity_id" uuid,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custody_reconciliations_organizationId_day_unique" UNIQUE("organization_id","day")
);
--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "key_ceremonies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"held_at" date NOT NULL,
	"participant_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"witnesses" text,
	"result" text DEFAULT 'pass' NOT NULL,
	"evidence_id" uuid,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "key_ceremonies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_key_holders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"user_id" uuid,
	"external_name" text,
	"role" text DEFAULT 'signer' NOT NULL,
	"site_id" uuid,
	"location_enc" text,
	"since" date,
	"until" date,
	"vetted_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_key_holders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'cold' NOT NULL,
	"technology" text DEFAULT 'multisig' NOT NULL,
	"purpose" text DEFAULT 'client' NOT NULL,
	"networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"asset_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quorum_required" integer DEFAULT 1 NOT NULL,
	"quorum_total" integer DEFAULT 1 NOT NULL,
	"address_label" text,
	"provider_id" uuid,
	"hsm_asset_id" uuid,
	"owner_user_id" uuid,
	"last_backup_test_at" date,
	"next_backup_test_due" date,
	"last_ceremony_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ADD CONSTRAINT "custody_reconciliations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ADD CONSTRAINT "custody_reconciliations_prepared_by_user_id_user_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ADD CONSTRAINT "custody_reconciliations_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ADD CONSTRAINT "custody_reconciliations_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" ADD CONSTRAINT "custody_reconciliations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_ceremonies" ADD CONSTRAINT "key_ceremonies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_ceremonies" ADD CONSTRAINT "key_ceremonies_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_ceremonies" ADD CONSTRAINT "key_ceremonies_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_ceremonies" ADD CONSTRAINT "key_ceremonies_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_key_holders" ADD CONSTRAINT "wallet_key_holders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_key_holders" ADD CONSTRAINT "wallet_key_holders_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_key_holders" ADD CONSTRAINT "wallet_key_holders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_key_holders" ADD CONSTRAINT "wallet_key_holders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_hsm_asset_id_assets_id_fk" FOREIGN KEY ("hsm_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "key_ceremonies_wallet_idx" ON "key_ceremonies" USING btree ("organization_id","wallet_id");--> statement-breakpoint
CREATE INDEX "wallet_key_holders_wallet_idx" ON "wallet_key_holders" USING btree ("organization_id","wallet_id");--> statement-breakpoint
CREATE INDEX "wallets_org_idx" ON "wallets" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "custody_reconciliations_org" ON "custody_reconciliations" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "key_ceremonies_org" ON "key_ceremonies" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_key_holders_org" ON "wallet_key_holders" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallets_org" ON "wallets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_key_holders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "key_ceremonies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custody_reconciliations" FORCE ROW LEVEL SECURITY;