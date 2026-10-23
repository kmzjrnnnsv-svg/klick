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
ALTER TABLE "wallet_transfers" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_proposed_by_user_id_user_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_address_book" ADD CONSTRAINT "wallet_address_book_vetoed_by_user_id_user_id_fk" FOREIGN KEY ("vetoed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_account_id_wallet_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."wallet_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_address_book_id_wallet_address_book_id_fk" FOREIGN KEY ("address_book_id") REFERENCES "public"."wallet_address_book"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" ADD CONSTRAINT "wallet_signer_anchor_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_address_book_org_idx" ON "wallet_address_book" USING btree ("organization_id","network","address");--> statement-breakpoint
CREATE INDEX "wallet_payouts_org_status_idx" ON "wallet_payouts" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "wallet_transfers" ADD CONSTRAINT "wallet_transfers_payout_id_wallet_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."wallet_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "wallet_address_book_org" ON "wallet_address_book" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_payouts_org" ON "wallet_payouts" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "wallet_signer_anchor_org" ON "wallet_signer_anchor" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "wallet_address_book" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_payouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_signer_anchor" FORCE ROW LEVEL SECURITY;
