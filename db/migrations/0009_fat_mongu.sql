ALTER TABLE "employers" ADD COLUMN "is_agency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN "extracted_kind" text;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN "extracted_meta" jsonb;--> statement-breakpoint
ALTER TABLE "vault_items" ADD COLUMN "extracted_at" timestamp;