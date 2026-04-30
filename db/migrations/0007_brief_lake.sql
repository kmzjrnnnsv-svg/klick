ALTER TABLE "vault_items" ALTER COLUMN "mime" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ALTER COLUMN "size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ALTER COLUMN "nonce" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ALTER COLUMN "sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN "badge_meta" jsonb;