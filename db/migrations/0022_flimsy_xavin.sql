CREATE TABLE "agency_members" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"user_id" text,
	"invite_email" text NOT NULL,
	"invite_token" text,
	"role" text DEFAULT 'recruiter' NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"joined_at" timestamp,
	"invited_by_user_id" text,
	CONSTRAINT "agency_members_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "agency_members_unique" UNIQUE("employer_id","invite_email")
);
--> statement-breakpoint
CREATE TABLE "job_mandates" (
	"job_id" text PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"client_website" text,
	"client_industry" text,
	"client_note" text,
	"client_visibility" text DEFAULT 'anonymous' NOT NULL,
	"commission_pct" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_mandates" ADD CONSTRAINT "job_mandates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;