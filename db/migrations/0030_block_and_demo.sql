ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "demo_batch_id" text;--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "employers" ADD COLUMN "demo_batch_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "demo_batch_id" text;
