ALTER TABLE "org_settings" ADD COLUMN "wallet_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Orgs, die den Wallet-Bereich schon nutzen, behalten ihn
UPDATE "org_settings" SET "wallet_enabled" = true
  WHERE "organization_id" IN (SELECT DISTINCT "organization_id" FROM "wallet_accounts");
