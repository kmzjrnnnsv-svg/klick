CREATE TABLE "sanctioned_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"source" text NOT NULL,
	"reference" text,
	"list_version" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sanctioned_addresses_chain_address_source_unique" UNIQUE("chain","address","source")
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"network" text NOT NULL,
	"kind" text DEFAULT 'cold' NOT NULL,
	"purpose" text DEFAULT 'own' NOT NULL,
	"account_key" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"custody_wallet_id" uuid,
	"next_receive_index" integer DEFAULT 0 NOT NULL,
	"next_change_index" integer DEFAULT 0 NOT NULL,
	"history_from" timestamp with time zone,
	"start_height" integer,
	"node_ready" boolean DEFAULT false NOT NULL,
	"imported_range" integer DEFAULT 0 NOT NULL,
	"sync_cursor" text,
	"sync_height" integer,
	"synced_at" timestamp with time zone,
	"sync_error" text,
	"balances" jsonb,
	"balance_height" integer,
	"balance_hash" text,
	"balance_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_accounts_organizationId_network_accountKey_unique" UNIQUE("organization_id","network","account_key")
);
--> statement-breakpoint
ALTER TABLE "wallet_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"branch" integer NOT NULL,
	"index" integer NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"issued_at" timestamp with time zone,
	"issued_by_user_id" uuid,
	"first_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_addresses_accountId_branch_index_unique" UNIQUE("account_id","branch","index")
);
--> statement-breakpoint
ALTER TABLE "wallet_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"address_id" uuid,
	"direction" text NOT NULL,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"txid" text NOT NULL,
	"output_ref" text NOT NULL,
	"address" text NOT NULL,
	"counterparty" text,
	"block_height" integer,
	"block_hash" text,
	"block_time" timestamp with time zone,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"screening" text DEFAULT 'unchecked' NOT NULL,
	"screening_ref" text,
	"frozen" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transfers_accountId_txid_outputRef_asset_unique" UNIQUE("account_id","txid","output_ref","asset")
);
--> statement-breakpoint
ALTER TABLE "wallet_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_custody_wallet_id_wallets_id_fk" FOREIGN KEY ("custody_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_address_id_wallet_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."wallet_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_accounts_org_idx" ON "wallet_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wallet_addresses_org_address_idx" ON "wallet_addresses" USING btree ("organization_id","address");--> statement-breakpoint
CREATE INDEX "wallet_transfers_org_idx" ON "wallet_transfers" USING btree ("organization_id","first_seen_at");--> statement-breakpoint
CREATE POLICY "wallet_accounts_org" ON "wallet_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_addresses_org" ON "wallet_addresses" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_transfers_org" ON "wallet_transfers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "wallet_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_addresses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_transfers" FORCE ROW LEVEL SECURITY;
