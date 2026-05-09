ALTER TABLE "candidate_profiles" ADD COLUMN "profile_language_origin" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "translations" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "translations_updated_at" timestamp;