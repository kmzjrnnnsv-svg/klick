ALTER TABLE "approval_decisions" ADD COLUMN "rule" text;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD COLUMN "trigger" text;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD COLUMN "custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "training_requirements" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
-- Auslöser aus dem bisherigen kind ableiten (lib/approvals/triggers.ts)
UPDATE "approval_workflows" SET "trigger" = CASE "kind"
	WHEN 'document_publish' THEN 'document.publish'
	WHEN 'risk_acceptance' THEN 'risk.accept'
	WHEN 'management_approval' THEN 'resolution.approve'
	WHEN 'management_decision' THEN 'decision.request'
	WHEN 'objective_release' THEN 'objective.release'
	WHEN 'control_signoff' THEN 'control.signoff'
	WHEN 'incident_closure' THEN 'incident.close'
	WHEN 'exception' THEN 'exception.request'
	WHEN 'change' THEN 'change.request'
	WHEN 'provider_onboarding' THEN 'provider.rating_red'
	WHEN 'process_change' THEN 'process.change'
	WHEN 'scope' THEN 'scope.approve'
	WHEN 'marketing' THEN 'marketing.publish'
	WHEN 'aml_risk_analysis' THEN 'aml.risk_analysis'
	WHEN 'own_funds' THEN 'own_funds.approve'
	ELSE "trigger" END
WHERE "trigger" IS NULL;--> statement-breakpoint
-- Name der Freigabe bei roter Lieferantenbewertung von „Dienstleister
-- aufnehmen“ (jetzt Auslöser provider.create) unterscheiden
UPDATE "approval_workflows" SET "name" = 'Rote Lieferantenbewertung freigeben'
WHERE "kind" = 'provider_onboarding' AND "name" = 'Dienstleister aufnehmen';
