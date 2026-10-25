ALTER TABLE "incidents" ADD COLUMN "management_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "management_acknowledged_by" uuid;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "org_role_id" uuid;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "status" text DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "replaces_assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "org_roles" ADD COLUMN "tasks" text;--> statement-breakpoint
ALTER TABLE "org_roles" ADD COLUMN "reports_to" text;--> statement-breakpoint
ALTER TABLE "org_roles" ADD COLUMN "deputy_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_roles" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "governance_mode" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_management_acknowledged_by_user_id_fk" FOREIGN KEY ("management_acknowledged_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_org_role_id_org_roles_id_fk" FOREIGN KEY ("org_role_id") REFERENCES "public"."org_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_replaces_assignment_id_role_assignments_id_fk" FOREIGN KEY ("replaces_assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Bestand: bisherige Besetzungen gelten als bestellt (Entscheidung 25.10.)
UPDATE "role_assignments" SET "status" = 'appointed';--> statement-breakpoint
-- Wer schon eigene Abläufe oder Rollen hat, startet individuell (ADR-024)
UPDATE "org_settings" SET "governance_mode" = 'individual'
WHERE "organization_id" IN (
	SELECT "organization_id" FROM "approval_workflows" WHERE "custom" = true
	UNION
	SELECT "organization_id" FROM "org_roles"
);
