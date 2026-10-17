CREATE TABLE "assessment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"question_code" text NOT NULL,
	"answer" text,
	"na_reason" text,
	"comment" text,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answered_by" text DEFAULT 'user' NOT NULL,
	"answered_by_user_id" uuid,
	"reviewer_verdict" text,
	"reviewer_answer" text,
	"reviewer_note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_answers_assessmentId_questionCode_unique" UNIQUE("assessment_id","question_code")
);
--> statement-breakpoint
ALTER TABLE "assessment_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'self' NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"template_code" text NOT NULL,
	"template_version" text DEFAULT '1' NOT NULL,
	"title" text NOT NULL,
	"frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"as_of" date,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"score" integer,
	"rating" text,
	"result" jsonb,
	"owner_user_id" uuid,
	"reviewer_user_id" uuid,
	"due_at" date,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" uuid,
	"decision" text,
	"decision_note" text,
	"contact_name" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_answered_by_user_id_user_id_fk" FOREIGN KEY ("answered_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_applied_by_user_id_user_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_subject_idx" ON "assessments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE POLICY "assessment_answers_org" ON "assessment_answers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "assessments_org" ON "assessments" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_answers" FORCE ROW LEVEL SECURITY;