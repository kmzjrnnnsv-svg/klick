ALTER TABLE "candidate_profiles" ADD COLUMN "publications" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "projects" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "volunteering" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "driving_licenses" text[];--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "availability" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "work_permit_status" text;--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD COLUMN "section_visibility" jsonb;
