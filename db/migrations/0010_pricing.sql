CREATE TABLE "price_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"level" text DEFAULT 'market' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "price_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "price_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"mode" text DEFAULT 'from' NOT NULL,
	"amount" integer,
	"unit" text,
	CONSTRAINT "price_overrides_groupId_itemKey_unique" UNIQUE("group_id","item_key")
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "price_group_id" uuid;--> statement-breakpoint
ALTER TABLE "price_groups" ADD CONSTRAINT "price_groups_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_overrides" ADD CONSTRAINT "price_overrides_group_id_price_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."price_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_price_group_id_price_groups_id_fk" FOREIGN KEY ("price_group_id") REFERENCES "public"."price_groups"("id") ON DELETE set null ON UPDATE no action;