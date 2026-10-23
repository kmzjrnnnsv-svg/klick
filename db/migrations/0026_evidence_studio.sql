ALTER TABLE "control_implementations" ADD COLUMN "sheet" jsonb;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "kind_code" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "content_sha256" text;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "follow_up_class" text;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "plan_due_at" date;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "follow_up" jsonb;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "audit_regimes" jsonb DEFAULT '{}'::jsonb NOT NULL;