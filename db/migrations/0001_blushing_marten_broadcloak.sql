CREATE TABLE "vault_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"nonce" text NOT NULL,
	"encrypted_dek" text,
	"sha256" text NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;