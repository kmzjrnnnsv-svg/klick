CREATE TABLE "decision_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"recommendation" text,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" date,
	"linked_entity_type" text,
	"linked_entity_id" uuid,
	"frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requirement_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"chosen_option" text,
	"decision_note" text,
	"approval_request_id" uuid,
	"resolution_id" uuid,
	"requested_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_requests_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "decision_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "resolutions" ADD COLUMN "requirement_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD CONSTRAINT "decision_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD CONSTRAINT "decision_requests_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD CONSTRAINT "decision_requests_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD CONSTRAINT "decision_requests_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_requests" ADD CONSTRAINT "decision_requests_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_requests_org_status_idx" ON "decision_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE POLICY "decision_requests_org" ON "decision_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
ALTER TABLE "decision_requests" FORCE ROW LEVEL SECURITY;
