ALTER TABLE "risk_treatments" ADD COLUMN "cost_eur" integer;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "scenario_code" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "impact_detail" jsonb;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "impact_description" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "existing_measures" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "protection_goals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "treatment_note" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "residual_note" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "provider_id" uuid;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "assessed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "risk_method" jsonb;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;