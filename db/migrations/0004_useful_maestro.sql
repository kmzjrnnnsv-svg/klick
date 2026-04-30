CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"hard_score" integer NOT NULL,
	"soft_score" integer NOT NULL,
	"rationale" text,
	"hard_reasons" jsonb,
	"matched_skills" jsonb,
	"missing_skills" jsonb,
	"status" text DEFAULT 'suggested' NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matches_job_candidate_unique" UNIQUE("job_id","candidate_user_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;