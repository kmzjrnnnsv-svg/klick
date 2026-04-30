CREATE TABLE "candidate_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"headline" text,
	"location" text,
	"years_experience" integer,
	"salary_min" integer,
	"languages" text[],
	"skills" jsonb,
	"experience" jsonb,
	"education" jsonb,
	"summary" text,
	"visibility" text DEFAULT 'matches_only' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;