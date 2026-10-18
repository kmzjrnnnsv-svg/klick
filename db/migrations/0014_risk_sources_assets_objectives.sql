ALTER TABLE "approval_requests" ADD COLUMN "steps" jsonb;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "source_entity_type" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "source_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD COLUMN "numeric_value" double precision;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD COLUMN "digest" jsonb;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "indicator_type" text DEFAULT 'kpi' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "direction" text DEFAULT 'higher_better' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "target_value" double precision;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "warn_at" double precision;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "alert_at" double precision;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "measure_every_months" integer;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "next_measure_at" date;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "objectives" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "risk_proposal_dismissals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "vendor" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "product" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "end_of_life_at" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "support_end_at" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "maintenance" text;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "maintenance_until" date;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "last_patched_at" date;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risks_source_idx" ON "risks" USING btree ("organization_id","source_entity_type","source_entity_id");