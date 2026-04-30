ALTER TABLE "candidate_profiles" ADD COLUMN "industries" text[];--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "awards" text[];--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "certifications_mentioned" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "mobility" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "preferred_role_level" text;