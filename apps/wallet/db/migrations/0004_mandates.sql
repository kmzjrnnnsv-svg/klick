CREATE TABLE "payout_mandates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"grantee_user_id" uuid NOT NULL,
	"network" text NOT NULL,
	"asset" text NOT NULL,
	"per_payout" text NOT NULL,
	"total" text NOT NULL,
	"destinations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL,
	"assertion" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payout_mandates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD COLUMN "mandate_id" uuid;--> statement-breakpoint
ALTER TABLE "payout_mandates" ADD CONSTRAINT "payout_mandates_organization_id_orgs_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_mandates" ADD CONSTRAINT "payout_mandates_grantee_user_id_user_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_mandates" ADD CONSTRAINT "payout_mandates_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_mandates" ADD CONSTRAINT "payout_mandates_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_mandates_grantee_idx" ON "payout_mandates" USING btree ("organization_id","grantee_user_id","network","asset");--> statement-breakpoint
ALTER TABLE "wallet_payouts" ADD CONSTRAINT "wallet_payouts_mandate_id_payout_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."payout_mandates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_payouts_mandate_idx" ON "wallet_payouts" USING btree ("mandate_id");--> statement-breakpoint
CREATE POLICY "payout_mandates_org" ON "payout_mandates" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
-- FORCE RLS (gilt auch für den Tabellen-Owner)
ALTER TABLE "payout_mandates" FORCE ROW LEVEL SECURITY;
