CREATE TABLE "agency_collaborations" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"lead_agency_id" text NOT NULL,
	"partner_agency_id" text,
	"partner_email" text NOT NULL,
	"partner_invite_token" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"lead_commission_pct" integer DEFAULT 70 NOT NULL,
	"partner_commission_pct" integer DEFAULT 30 NOT NULL,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	CONSTRAINT "agency_collaborations_partner_invite_token_unique" UNIQUE("partner_invite_token"),
	CONSTRAINT "collab_unique" UNIQUE("job_id","partner_email")
);
--> statement-breakpoint
CREATE TABLE "collaboration_candidate_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"collaboration_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"proposed_by_user_id" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collab_proposal_unique" UNIQUE("collaboration_id","candidate_user_id")
);
--> statement-breakpoint
CREATE TABLE "commission_events" (
	"id" text PRIMARY KEY NOT NULL,
	"collaboration_id" text NOT NULL,
	"candidate_user_id" text NOT NULL,
	"total_commission_eur" integer NOT NULL,
	"lead_amount_eur" integer NOT NULL,
	"partner_amount_eur" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agency_collaborations" ADD CONSTRAINT "agency_collaborations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_collaborations" ADD CONSTRAINT "agency_collaborations_lead_agency_id_employers_id_fk" FOREIGN KEY ("lead_agency_id") REFERENCES "public"."employers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_collaborations" ADD CONSTRAINT "agency_collaborations_partner_agency_id_employers_id_fk" FOREIGN KEY ("partner_agency_id") REFERENCES "public"."employers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_candidate_proposals" ADD CONSTRAINT "collaboration_candidate_proposals_collaboration_id_agency_collaborations_id_fk" FOREIGN KEY ("collaboration_id") REFERENCES "public"."agency_collaborations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_candidate_proposals" ADD CONSTRAINT "collaboration_candidate_proposals_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_candidate_proposals" ADD CONSTRAINT "collaboration_candidate_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_events" ADD CONSTRAINT "commission_events_collaboration_id_agency_collaborations_id_fk" FOREIGN KEY ("collaboration_id") REFERENCES "public"."agency_collaborations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_events" ADD CONSTRAINT "commission_events_candidate_user_id_users_id_fk" FOREIGN KEY ("candidate_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;