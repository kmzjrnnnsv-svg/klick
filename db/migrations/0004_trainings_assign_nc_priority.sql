ALTER TABLE "training_assignments" ADD COLUMN "assigned_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN "evidence_id" uuid;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "training_requirements" ADD COLUMN "course_url" text;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "priority_note" text;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "prioritized_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD COLUMN "prioritized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_assigned_by_user_id_user_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_prioritized_by_user_id_user_id_fk" FOREIGN KEY ("prioritized_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;