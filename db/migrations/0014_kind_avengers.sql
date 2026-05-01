ALTER TABLE "jobs" ADD COLUMN "salary_benchmark_low" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_benchmark_high" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_fairness" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_delta_pct" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "pros" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cons" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "experience_verdict" text;