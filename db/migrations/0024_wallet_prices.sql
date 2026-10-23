CREATE TABLE "price_ticks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed" text NOT NULL,
	"network" text NOT NULL,
	"round_id" text NOT NULL,
	"answer" text NOT NULL,
	"decimals" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_ticks_feed_network_roundId_unique" UNIQUE("feed","network","round_id")
);
--> statement-breakpoint
CREATE TABLE "wallet_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pairs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intro_step" text,
	"intro_completed_at" timestamp with time zone,
	"intro_deferred_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_preferences_organizationId_userId_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "wallet_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallet_preferences" ADD CONSTRAINT "wallet_preferences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_preferences" ADD CONSTRAINT "wallet_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_ticks_feed_time_idx" ON "price_ticks" USING btree ("feed","updated_at");--> statement-breakpoint
CREATE POLICY "wallet_preferences_org" ON "wallet_preferences" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "wallet_preferences" FORCE ROW LEVEL SECURITY;
