CREATE TABLE "disclosures" (
	"id" text PRIMARY KEY NOT NULL,
	"interest_id" text NOT NULL,
	"vault_item_id" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "disclosures_interest_vault_unique" UNIQUE("interest_id","vault_item_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "public_share_token" text;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_vault_item_id_vault_items_id_fk" FOREIGN KEY ("vault_item_id") REFERENCES "public"."vault_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_public_share_token_unique" UNIQUE("public_share_token");