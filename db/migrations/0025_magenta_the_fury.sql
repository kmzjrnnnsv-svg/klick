CREATE TABLE "application_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"by_user_id" text NOT NULL,
	"by_role" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring_process_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hiring_process_templates_employer_name_unique" UNIQUE("employer_id","name")
);
--> statement-breakpoint
CREATE TABLE "job_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"expected_days" integer,
	"responsible_role" text DEFAULT 'recruiter' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"materials" text,
	CONSTRAINT "job_stages_position_unique" UNIQUE("job_id","position")
);
--> statement-breakpoint
CREATE TABLE "stage_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"job_stage_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"clarity" integer,
	"respect" integer,
	"effort" integer,
	"response_time" integer,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_ratings_unique" UNIQUE("application_id","job_stage_id")
);
--> statement-breakpoint
CREATE TABLE "template_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"expected_days" integer,
	"responsible_role" text DEFAULT 'recruiter' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"materials" text
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "application_events" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "current_stage_id" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "stage_entered_at" timestamp;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "closure_deadline_at" timestamp;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "reject_free_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "honest_posting_flag" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_messages" ADD CONSTRAINT "application_messages_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_process_templates" ADD CONSTRAINT "hiring_process_templates_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stages" ADD CONSTRAINT "job_stages_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_job_stage_id_job_stages_id_fk" FOREIGN KEY ("job_stage_id") REFERENCES "public"."job_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_ratings" ADD CONSTRAINT "stage_ratings_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_stages" ADD CONSTRAINT "template_stages_template_id_hiring_process_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."hiring_process_templates"("id") ON DELETE cascade ON UPDATE no action;