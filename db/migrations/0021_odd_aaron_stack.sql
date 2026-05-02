ALTER TABLE "candidate_profiles" ADD COLUMN "career_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "career_analysis_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "team_size" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "growth_stage" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tech_stack_detail" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "decision_process" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "remote_onsite_ratio" integer;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "must_reasoning" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "first_90_days_goals" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "posting_quality" jsonb;