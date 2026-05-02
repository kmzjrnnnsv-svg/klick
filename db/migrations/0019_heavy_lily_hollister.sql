CREATE TABLE "assessment_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"job_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_score" integer,
	"max_score" integer,
	"submitted_at" timestamp,
	"graded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_response_unique" UNIQUE("assessment_id","candidate_user_id")
);
--> statement-breakpoint
CREATE TABLE "diversity_responses" (
	"user_id" text PRIMARY KEY NOT NULL,
	"gender_identity" text,
	"ethnicity" text,
	"has_disability" boolean,
	"age_range" text,
	"consented_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_assessment_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"choices" jsonb,
	"correct_choice" integer,
	"rubric" text,
	"max_points" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_assessments_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"employer_id" text NOT NULL,
	"reported_by_role" text NOT NULL,
	"reported_by_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"notes" text,
	"final_salary" integer,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_per_role_unique" UNIQUE("job_id","candidate_user_id","reported_by_role")
);
--> statement-breakpoint
CREATE TABLE "reference_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_user_id" text NOT NULL,
	"referee_name" text NOT NULL,
	"referee_email" text NOT NULL,
	"referee_relation" text,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"submitted_at" timestamp,
	CONSTRAINT "reference_checks_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_assessment_id_job_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."job_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_responses" ADD CONSTRAINT "assessment_responses_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diversity_responses" ADD CONSTRAINT "diversity_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assessment_questions" ADD CONSTRAINT "job_assessment_questions_assessment_id_job_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."job_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assessments" ADD CONSTRAINT "job_assessments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_checks" ADD CONSTRAINT "reference_checks_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;