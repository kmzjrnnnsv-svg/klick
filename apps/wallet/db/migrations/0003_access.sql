ALTER TABLE "org_settings" ADD COLUMN "network_policy" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "security_keys_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "allowed_assets" jsonb;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "mandates_required" boolean DEFAULT false NOT NULL;