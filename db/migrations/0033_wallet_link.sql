CREATE TABLE "crypto_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"wallet_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"network" text NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"first_address" text,
	"status" text NOT NULL,
	"wallet_id" uuid,
	"opened_at" timestamp with time zone,
	"rev" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_accounts_organizationId_linkId_walletAccountId_unique" UNIQUE("organization_id","link_id","wallet_account_id")
);
--> statement-breakpoint
ALTER TABLE "crypto_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crypto_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"alert_id" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"subject" jsonb,
	"raised_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"effect" text NOT NULL,
	"effect_id" uuid,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_alerts_organizationId_linkId_alertId_unique" UNIQUE("organization_id","link_id","alert_id")
);
--> statement-breakpoint
ALTER TABLE "crypto_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crypto_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"day" date NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"accounts" jsonb NOT NULL,
	"screening" jsonb,
	"rev" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_balances_organizationId_linkId_day_unique" UNIQUE("organization_id","link_id","day")
);
--> statement-breakpoint
ALTER TABLE "crypto_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crypto_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"wallet_account_id" uuid NOT NULL,
	"network" text NOT NULL,
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
	"status" text NOT NULL,
	"screening" text NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"payout_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"rev" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_movements_organizationId_linkId_transferId_unique" UNIQUE("organization_id","link_id","transfer_id")
);
--> statement-breakpoint
ALTER TABLE "crypto_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crypto_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"payout_id" uuid NOT NULL,
	"wallet_account_id" uuid NOT NULL,
	"network" text NOT NULL,
	"asset" text NOT NULL,
	"amount" text NOT NULL,
	"destination" text NOT NULL,
	"destination_label" text NOT NULL,
	"speed" text NOT NULL,
	"status" text NOT NULL,
	"intent_id" text NOT NULL,
	"fee_cap" text NOT NULL,
	"fee" text,
	"txid" text,
	"txids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"broadcast_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"rev" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_payouts_organizationId_linkId_payoutId_unique" UNIQUE("organization_id","link_id","payout_id")
);
--> statement-breakpoint
ALTER TABLE "crypto_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_link_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"hash" text NOT NULL,
	"data" jsonb,
	"result" text NOT NULL,
	"code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_link_events_organizationId_eventId_unique" UNIQUE("organization_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_link_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "wallet_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"wallet_org_id" uuid,
	"wallet_org_name" text,
	"wallet_org_slug" text,
	"wallet_link_id" uuid,
	"custody_mode" text,
	"is_operator" boolean,
	"casp_licence_ref" text,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"last_hello_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"heartbeat" jsonb,
	"last_day_closed" date,
	"sanctions_list" jsonb,
	"ceremony" jsonb,
	"created_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_accounts" ADD CONSTRAINT "crypto_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_accounts" ADD CONSTRAINT "crypto_accounts_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_accounts" ADD CONSTRAINT "crypto_accounts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_alerts" ADD CONSTRAINT "crypto_alerts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_alerts" ADD CONSTRAINT "crypto_alerts_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_balances" ADD CONSTRAINT "crypto_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_balances" ADD CONSTRAINT "crypto_balances_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payouts" ADD CONSTRAINT "crypto_payouts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_payouts" ADD CONSTRAINT "crypto_payouts_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_link_events" ADD CONSTRAINT "wallet_link_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_link_events" ADD CONSTRAINT "wallet_link_events_link_id_wallet_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."wallet_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_token_id_access_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_links" ADD CONSTRAINT "wallet_links_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_movements_org_seen_idx" ON "crypto_movements" USING btree ("organization_id","first_seen_at");--> statement-breakpoint
CREATE INDEX "wallet_link_events_link_idx" ON "wallet_link_events" USING btree ("organization_id","link_id","seq");--> statement-breakpoint
CREATE INDEX "wallet_links_org_idx" ON "wallet_links" USING btree ("organization_id");--> statement-breakpoint
CREATE POLICY "crypto_accounts_org" ON "crypto_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "crypto_alerts_org" ON "crypto_alerts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "crypto_balances_org" ON "crypto_balances" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "crypto_movements_org" ON "crypto_movements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "crypto_payouts_org" ON "crypto_payouts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_link_events_select" ON "wallet_link_events" AS PERMISSIVE FOR SELECT TO public USING (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_link_events_insert" ON "wallet_link_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_links_org" ON "wallet_links" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
-- FORCE RLS (gilt auch für den Tabellen-Owner)
ALTER TABLE "wallet_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_link_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_balances" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_payouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_alerts" FORCE ROW LEVEL SECURITY;
