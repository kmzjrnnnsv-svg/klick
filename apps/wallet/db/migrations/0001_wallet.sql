CREATE TABLE "price_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed" text NOT NULL,
	"network" text NOT NULL,
	"round_id" text NOT NULL,
	"answer" text NOT NULL,
	"decimals" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_ticks_feed_network_roundId_unique" UNIQUE("feed","network","round_id")
);
--> statement-breakpoint
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
CREATE TABLE "wallet_address_book" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"label" text NOT NULL,
	"intent_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"active_from" timestamp with time zone,
	"screening" text DEFAULT 'unchecked' NOT NULL,
	"screening_ref" text,
	"proposed_by_user_id" uuid,
	"vetoed_by_user_id" uuid,
	"vetoed_at" timestamp with time zone,
	"veto_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_address_book_organizationId_intentId_unique" UNIQUE("organization_id","intent_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_address_book" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
CREATE TABLE "wallet_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"address_book_id" uuid,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"destination" text NOT NULL,
	"destination_label" text NOT NULL,
	"fee_cap" text NOT NULL,
	"speed" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'awaiting_approval' NOT NULL,
	"intent_id" text NOT NULL,
	"intent_text" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"signable_at" timestamp with time zone,
	"plan" jsonb,
	"raw_tx" text,
	"txid" text,
	"txids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee" text,
	"nonce" text,
	"signed_at" timestamp with time zone,
	"broadcast_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"bump_requested" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_payouts_organizationId_intentId_unique" UNIQUE("organization_id","intent_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pairs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intro_step" text,
	"intro_completed_at" timestamp with time zone,
	"intro_deferred_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_preferences_organizationId_userId_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_signer_anchor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"head" text NOT NULL,
	"bundle_hash" text,
	"policy_hash" text,
	"frozen" boolean DEFAULT false NOT NULL,
	"frozen_reason" text,
	"checked_at" timestamp with time zone,
	"unreachable_since" timestamp with time zone,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_signer_anchor_organizationId_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
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
	"payout_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transfers_accountId_txid_outputRef_asset_unique" UNIQUE("account_id","txid","output_ref","asset")
);
--> statement-breakpoint
ALTER TABLE "wallet_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_proposed_by_user_id_user_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_vetoed_by_user_id_user_id_fk" FOREIGN KEY ("vetoed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_address_book_id_wallet_address_book_id_fk" FOREIGN KEY ("address_book_id") REFERENCES "public"."wallet_address_book"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_preferences" ADD CONSTRAINT "wallet_preferences_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_preferences" ADD CONSTRAINT "wallet_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" ADD CONSTRAINT "wallet_signer_anchor_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_address_id_wallet_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."wallet_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_payout_id_wallet_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."wallet_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_ticks_feed_time_idx" ON "price_ticks" USING btree ("feed","updated_at");--> statement-breakpoint
CREATE INDEX "wallet_accounts_org_idx" ON "wallet_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "wallet_address_book_org_idx" ON "wallet_address_book" USING btree ("organization_id","network","address");--> statement-breakpoint
CREATE INDEX "wallet_addresses_org_address_idx" ON "wallet_addresses" USING btree ("organization_id","address");--> statement-breakpoint
CREATE INDEX "wallet_payouts_org_status_idx" ON "wallet_payouts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "wallet_transfers_org_idx" ON "wallet_transfers" USING btree ("organization_id","first_seen_at");--> statement-breakpoint
CREATE POLICY "wallet_accounts_org" ON "wallet_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_address_book_org" ON "wallet_address_book" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_addresses_org" ON "wallet_addresses" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_payouts_org" ON "wallet_payouts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_preferences_org" ON "wallet_preferences" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_signer_anchor_org" ON "wallet_signer_anchor" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_transfers_org" ON "wallet_transfers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
-- FORCE RLS (gilt auch für den Tabellen-Owner)
ALTER TABLE "wallet_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_address_book" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_addresses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_payouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_transfers" FORCE ROW LEVEL SECURITY;
