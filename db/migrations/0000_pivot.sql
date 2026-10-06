-- ═══════════════════════════════════════════════════════════════════════════
-- Block A — Chain-Reset: Alt-Daten sichern, Recruiting-Schema entfernen,
-- RLS-Hilfsfunktionen anlegen. Muss VOR den generierten CREATEs laufen,
-- weil audit_log/notifications/cms_pages in Alt und Neu existieren und die
-- generierten CREATE POLICY-Statements app_current_org() referenzieren.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'CREATE TEMP TABLE legacy_admins AS SELECT id, lower(email) AS email, name, email_verified, created_at FROM public.users WHERE role = ''admin''';
  ELSE
    CREATE TEMP TABLE legacy_admins (id text, email text, name text, email_verified timestamp, created_at timestamp);
  END IF;
  IF to_regclass('public.cms_pages') IS NOT NULL THEN
    EXECUTE 'CREATE TEMP TABLE legacy_cms AS SELECT slug, title, body, updated_at FROM public.cms_pages';
  ELSE
    CREATE TEMP TABLE legacy_cms (slug text, title text, body text, updated_at timestamp);
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "accounts","agency_collaborations","agency_members","ai_evaluations","application_events","application_messages","application_notes","applications","assessment_responses","audit_log","candidate_profiles","cms_pages","collaboration_candidate_proposals","commission_events","disclosures","diversity_responses","employers","favorites","geocode_cache","hiring_process_templates","interests","job_assessment_questions","job_assessments","job_mandates","job_questions","job_stages","jobs","matches","notifications","offers","outcomes","reference_checks","reference_disclosures","saved_searches","sessions","stage_ratings","template_stages","tenants","users","vault_items","verification_tokens","verifications" CASCADE;
--> statement-breakpoint
DO $$ BEGIN
  -- Alt-pgboss-Schema nur entfernen, wenn es uns gehört (Prod: Migrator = alte Rolle).
  IF EXISTS (SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname = 'pgboss' AND r.rolname = current_user) THEN
    EXECUTE 'DROP SCHEMA pgboss CASCADE';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.scope', true) = 'platform'
$$;
--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Block B — generiert von drizzle-kit (unverändert)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE "control_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"coverage" text DEFAULT 'full' NOT NULL,
	"note" text,
	CONSTRAINT "control_requirements_controlId_requirementId_unique" UNIQUE("control_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"implementation_guidance" text,
	"domain" text NOT NULL,
	"effort" text DEFAULT 'M' NOT NULL,
	"kind" text DEFAULT 'organizational' NOT NULL,
	"evidence_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb,
	"audit_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"test_method_hint" text,
	"templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"obligations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "controls_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "framework_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "framework_sections_frameworkId_code_unique" UNIQUE("framework_id","code")
);
--> statement-breakpoint
CREATE TABLE "frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"authority" text,
	"jurisdiction" text DEFAULT 'eu' NOT NULL,
	"legal_basis" text,
	"legal_basis_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"recommended_approach" text,
	"source_url" text,
	"successor_framework_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "frameworks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"section_id" uuid,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"requirement_text" text NOT NULL,
	"guidance" text,
	"legal_basis_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domain" text NOT NULL,
	"services" jsonb,
	"applies_from_stage" text,
	"applies_to_roles" jsonb,
	"effective_from" date,
	"effective_until" date,
	"legal_status" text DEFAULT 'in_force' NOT NULL,
	"evidence_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"related_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb,
	"audit_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pitfalls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "requirements_frameworkId_code_unique" UNIQUE("framework_id","code")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "cms_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "member_access" (
	"member_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"access_until" timestamp with time zone,
	"grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"payload" jsonb,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_at" date,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "org_frameworks_organizationId_frameworkId_unique" UNIQUE("organization_id","framework_id")
);
--> statement-breakpoint
ALTER TABLE "org_frameworks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_dek" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"sector" text DEFAULT 'other' NOT NULL,
	"casp_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"licence_stage" text DEFAULT '0_vorbereitung' NOT NULL,
	"licence_partner_provider_id" uuid,
	"nis2_category" text DEFAULT 'none' NOT NULL,
	"nis2_status" text DEFAULT 'unchecked' NOT NULL,
	"tlpt_designated" boolean DEFAULT false NOT NULL,
	"issues_tokens" text DEFAULT 'none' NOT NULL,
	"reporting_regime_default" text DEFAULT 'dora' NOT NULL,
	"target_jurisdictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_scales" jsonb,
	"risk_appetite" jsonb DEFAULT '{"acceptable":4,"tolerable":9}'::jsonb NOT NULL,
	"review_defaults" jsonb DEFAULT '{"control":12,"document":12,"risk":3,"provider":12,"process":12}'::jsonb NOT NULL,
	"document_numbering" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"apply_baseline" boolean DEFAULT false NOT NULL,
	"allow_self_approval" boolean DEFAULT true NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"plan" text DEFAULT 'start' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "posture_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"date" date NOT NULL,
	"coverage_pct" numeric(5, 2),
	"progress_pct" numeric(5, 2),
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "posture_snapshots_organizationId_frameworkId_date_unique" UNIQUE("organization_id","framework_id","date")
);
--> statement-breakpoint
ALTER TABLE "posture_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'system' NOT NULL,
	"classification" text DEFAULT 'internal' NOT NULL,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"provider_id" uuid,
	"location" text,
	"description" text,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"legacy_reviewed_at" date,
	"custodian" text,
	"backup_location" text,
	"rotation_due" date,
	"ceremony_evidence_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_raci" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"user_id" uuid,
	"function" text,
	"raci" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "process_raci" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'core' NOT NULL,
	"owner_user_id" uuid,
	"deputy_user_id" uuid,
	"assignee_user_id" uuid,
	"criticality" text DEFAULT 'standard' NOT NULL,
	"rto_hours" integer,
	"rpo_hours" integer,
	"mtpd_hours" integer,
	"impact_notes" text,
	"inputs" text,
	"outputs" text,
	"kpis" jsonb,
	"parent_process_id" uuid,
	"review_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processes_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "processes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lei" text,
	"partner_type" text DEFAULT 'ict' NOT NULL,
	"is_ict" boolean DEFAULT true NOT NULL,
	"is_outsourcing" boolean DEFAULT false NOT NULL,
	"is_material" boolean DEFAULT false NOT NULL,
	"service_description" text,
	"service_type" text,
	"functions_supported" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criticality" text DEFAULT 'standard' NOT NULL,
	"substitutability" text,
	"country" text,
	"data_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subcontractors" jsonb,
	"is_intra_group" boolean DEFAULT false NOT NULL,
	"processes_personal_data" boolean DEFAULT false NOT NULL,
	"dpa_signed_at" date,
	"contract_ref" text,
	"contract_start" date,
	"contract_end" date,
	"notice_period_days" integer,
	"contract_clauses" jsonb,
	"exit_strategy" text,
	"exit_plan_tested_at" date,
	"risk_analysis_at" date,
	"due_diligence" jsonb,
	"last_assessment_at" date,
	"next_assessment_at" date,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"approver_user_id" uuid,
	"decision" text NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_version_ref" text,
	"requested_by_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"self_approved" boolean DEFAULT false NOT NULL,
	"self_approval_reason" text
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_workflows_organizationId_kind_unique" UNIQUE("organization_id","kind")
);
--> statement-breakpoint
ALTER TABLE "approval_workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body_markdown" text NOT NULL,
	"parent_id" uuid,
	"resolved_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "control_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"implementation_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	CONSTRAINT "control_evidence_implementationId_evidenceId_unique" UNIQUE("implementation_id","evidence_id")
);
--> statement-breakpoint
ALTER TABLE "control_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "control_implementations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"note" text,
	"implemented_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"next_review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "control_implementations_organizationId_controlId_unique" UNIQUE("organization_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "control_implementations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "control_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"implementation_id" uuid,
	"asset_id" uuid,
	"process_id" uuid,
	"method" text NOT NULL,
	"scope" text,
	"planned_at" date,
	"tested_at" timestamp with time zone,
	"tester_user_id" uuid,
	"result" text,
	"notes" text,
	"evidence_id" uuid,
	"next_test_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"scope" text DEFAULT 'approvals' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delegations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text DEFAULT 'click' NOT NULL,
	CONSTRAINT "document_acknowledgements_documentVersionId_userId_unique" UNIQUE("document_version_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "document_acknowledgements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "document_controls_documentId_controlId_unique" UNIQUE("document_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "document_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	CONSTRAINT "document_processes_documentId_processId_unique" UNIQUE("document_id","process_id")
);
--> statement-breakpoint
ALTER TABLE "document_processes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "document_requirements_documentId_requirementId_unique" UNIQUE("document_id","requirement_id")
);
--> statement-breakpoint
ALTER TABLE "document_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" text NOT NULL,
	"body_markdown" text,
	"file_evidence_id" uuid,
	"change_summary" text NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_documentId_version_unique" UNIQUE("document_id","version")
);
--> statement-breakpoint
ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"doc_number" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'policy' NOT NULL,
	"domain" text,
	"classification" text DEFAULT 'internal' NOT NULL,
	"owner_user_id" uuid,
	"author_user_id" uuid,
	"assignee_user_id" uuid,
	"approver_function" text,
	"body_markdown" text,
	"file_evidence_id" uuid,
	"version" text DEFAULT '0.1' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"review_cycle_months" integer DEFAULT 12 NOT NULL,
	"next_review_at" date,
	"supersedes_document_id" uuid,
	"parent_document_id" uuid,
	"distribution" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retention_years" integer,
	"legal_basis_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"template_code" text,
	"iso_mandatory" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_organizationId_docNumber_unique" UNIQUE("organization_id","doc_number")
);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'document' NOT NULL,
	"classification" text DEFAULT 'internal' NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"storage_key" text,
	"key_version" integer,
	"sha256" text,
	"url" text,
	"valid_until" date,
	"supersedes_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"control_id" uuid,
	"document_id" uuid,
	"justification" text NOT NULL,
	"compensating_controls" text,
	"risk_id" uuid,
	"approval_request_id" uuid,
	"owner_user_id" uuid,
	"valid_until" date NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exceptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_user_id" uuid,
	"kind" text DEFAULT 'update' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incident_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"aware_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone,
	"classified_at" timestamp with time zone,
	"regimes" jsonb DEFAULT '["dora"]'::jsonb NOT NULL,
	"affects_payments" boolean DEFAULT false NOT NULL,
	"dora_criteria" jsonb,
	"nis2_criteria" jsonb,
	"dsgvo_criteria" jsonb,
	"classification" text DEFAULT 'unclassified' NOT NULL,
	"classification_override_note" text,
	"early_warning_at" timestamp with time zone,
	"initial_due_at" timestamp with time zone,
	"intermediate_due_at" timestamp with time zone,
	"final_due_at" timestamp with time zone,
	"initial_reported_at" timestamp with time zone,
	"intermediate_reported_at" timestamp with time zone,
	"final_reported_at" timestamp with time zone,
	"root_cause" text,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "loss_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"occurred_at" date NOT NULL,
	"detected_at" date,
	"amount" numeric(18, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"recovery" numeric(18, 2),
	"category" text NOT NULL,
	"cause" text,
	"description" text,
	"incident_id" uuid,
	"risk_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loss_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "milestone_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "milestone_controls_milestoneId_controlId_unique" UNIQUE("milestone_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "milestone_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"phase" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"due_at" date,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "process_assets_processId_assetId_unique" UNIQUE("process_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "process_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "process_controls_processId_controlId_unique" UNIQUE("process_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "process_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	CONSTRAINT "process_providers_processId_providerId_unique" UNIQUE("process_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "process_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "process_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	CONSTRAINT "process_risks_processId_riskId_unique" UNIQUE("process_id","risk_id")
);
--> statement-breakpoint
ALTER TABLE "process_risks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requirement_applicability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_applicability_organizationId_requirementId_unique" UNIQUE("organization_id","requirement_id")
);
--> statement-breakpoint
ALTER TABLE "requirement_applicability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"resolution_number" text NOT NULL,
	"date" date NOT NULL,
	"body" text DEFAULT 'management' NOT NULL,
	"subject" text NOT NULL,
	"decision_text" text NOT NULL,
	"legal_basis" text,
	"required_code" text,
	"linked_entity_type" text,
	"linked_entity_id" uuid,
	"attendee_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minutes_evidence_id" uuid,
	"approval_request_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resolutions_organizationId_resolutionNumber_unique" UNIQUE("organization_id","resolution_number")
);
--> statement-breakpoint
ALTER TABLE "resolutions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risk_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "risk_assets_riskId_assetId_unique" UNIQUE("risk_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "risk_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risk_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	CONSTRAINT "risk_controls_riskId_controlId_unique" UNIQUE("risk_id","control_id")
);
--> statement-breakpoint
ALTER TABLE "risk_controls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risk_treatments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"risk_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_user_id" uuid,
	"due_at" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_treatments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'operational' NOT NULL,
	"likelihood" integer DEFAULT 3 NOT NULL,
	"impact" integer DEFAULT 3 NOT NULL,
	"treatment" text DEFAULT 'mitigate' NOT NULL,
	"residual_likelihood" integer,
	"residual_impact" integer,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"review_at" date,
	"accepted_by_user_id" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risks_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "risks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trigger_entity_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_bundles_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "task_bundles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_user_id" uuid,
	"created_by_user_id" uuid,
	"due_at" date,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"source_kind" text DEFAULT 'manual' NOT NULL,
	"bundle_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"due_at" date NOT NULL,
	"completed_at" date,
	"training_id" uuid,
	"status" text DEFAULT 'due' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "training_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"function" text,
	"org_role" text,
	"frequency_months" integer DEFAULT 12 NOT NULL,
	"legal_basis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_requirements_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "training_requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"held_at" date NOT NULL,
	"trainer_user_id" uuid,
	"external_trainer" text,
	"attendee_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"evidence_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trainings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "watchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "watchers_entityType_entityId_userId_unique" UNIQUE("entity_type","entity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "watchers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"control_id" uuid,
	"requirement_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"nonconformity_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_programme_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"programme_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_ref" text NOT NULL,
	"planned_year" integer NOT NULL,
	"risk_rating" text DEFAULT 'medium' NOT NULL,
	"frequency_years" integer DEFAULT 3 NOT NULL,
	"audit_id" uuid
);
--> statement-breakpoint
ALTER TABLE "audit_programme_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_programmes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cycle_start" date NOT NULL,
	"cycle_years" integer DEFAULT 3 NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_programmes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"requirement_id" uuid,
	"control_id" uuid,
	"requested_by_user_id" uuid,
	"assignee_user_id" uuid,
	"due_at" date,
	"status" text DEFAULT 'open' NOT NULL,
	"response_note" text,
	"response_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answered_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"programme_id" uuid,
	"type" text DEFAULT 'internal' NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"period_start" date,
	"period_end" date,
	"framework_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auditor_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auditor_user_id" uuid,
	"external_auditor" text,
	"planned_at" date,
	"performed_at" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"report_evidence_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"interested_party_id" uuid,
	"audience" text,
	"purpose" text,
	"channel" text,
	"frequency" text,
	"trigger" text DEFAULT 'regular' NOT NULL,
	"owner_function" text,
	"owner_user_id" uuid,
	"template_document_id" uuid,
	"legal_basis" text,
	"obligation_code" text,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"channel" text,
	"complainant_ref" text,
	"category" text,
	"description" text,
	"acknowledged_at" timestamp with time zone,
	"ack_due_at" timestamp with time zone,
	"response_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"outcome" text,
	"escalated_to_regulator" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conflicts_of_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text,
	"parties_involved" text,
	"description" text,
	"mitigation" text,
	"disclosed_at" date,
	"owner_user_id" uuid,
	"review_at" date,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conflicts_of_interest" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "context_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text DEFAULT 'internal' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"impact" text,
	"related_risk_id" uuid,
	"owner_user_id" uuid,
	"review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"subject_ref" text,
	"due_at" timestamp with time zone NOT NULL,
	"extended_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"evidence_id" uuid,
	"owner_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interested_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'regulator' NOT NULL,
	"expectations" text,
	"requirements" text,
	"relevant_frameworks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"how_addressed" text,
	"contact" text,
	"owner_user_id" uuid,
	"review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interested_parties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kpi_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"measured_at" date NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"created_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "kpi_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "management_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"held_at" date NOT NULL,
	"attendee_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"decisions" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"minutes_evidence_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "management_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "nonconformities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"source" text DEFAULT 'self_identified' NOT NULL,
	"source_ref_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"root_cause" text,
	"correction" text,
	"corrective_action" text,
	"owner_user_id" uuid,
	"assignee_user_id" uuid,
	"due_at" date,
	"effectiveness_check_at" date,
	"effectiveness_result" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nonconformities_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "nonconformities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"framework_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kpi_name" text,
	"unit" text,
	"target" text,
	"due_at" date,
	"owner_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "objectives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regulator_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"authority" text DEFAULT 'bafin' NOT NULL,
	"date" date NOT NULL,
	"subject" text NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"deadline" date,
	"response_at" date,
	"owner_user_id" uuid,
	"evidence_id" uuid,
	"linked_entity_type" text,
	"linked_entity_id" uuid,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "regulator_interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"function" text NOT NULL,
	"user_id" uuid,
	"external_name" text,
	"appointed_at" date,
	"deputy_user_id" uuid,
	"evidence_id" uuid,
	"fit_proper_status" text DEFAULT 'not_required' NOT NULL,
	"fit_proper_checklist" text,
	"documents_valid_until" date,
	"review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"framework_id" uuid,
	"statement" text NOT NULL,
	"boundaries" text,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "whistleblowing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"internal_ref" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"channel" text,
	"category" text,
	"summary" text,
	"ack_due_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"feedback_due_at" timestamp with time zone,
	"feedback_at" timestamp with time zone,
	"owner_function" text DEFAULT 'compliance' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whistleblowing_reports_organizationId_internalRef_unique" UNIQUE("organization_id","internal_ref")
);
--> statement-breakpoint
ALTER TABLE "whistleblowing_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "aml_monitoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"threshold" text,
	"rationale" text,
	"legal_basis" text,
	"owner_user_id" uuid,
	"last_tuned_at" date,
	"false_positive_rate" numeric(5, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aml_monitoring_rules_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "aml_monitoring_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "aml_risk_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" text NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overall_risk" text,
	"summary" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"next_review_at" date,
	"owner_user_id" uuid,
	"evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aml_risk_analyses_organizationId_version_unique" UNIQUE("organization_id","version")
);
--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crypto_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"issuer" text,
	"type" text DEFAULT 'emt' NOT NULL,
	"issuer_authorisation" text,
	"whitepaper_ref" text,
	"micar_status" text DEFAULT 'pending' NOT NULL,
	"networks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"accepted_from" date,
	"per_tx_limit" numeric(18, 2),
	"reviewed_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crypto_assets_organizationId_symbol_unique" UNIQUE("organization_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "crypto_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"insurer" text NOT NULL,
	"policy_ref" text,
	"coverage_limit" numeric(18, 2),
	"sub_limits" jsonb,
	"exclusions" text,
	"valid_from" date,
	"valid_until" date,
	"premium" numeric(18, 2),
	"evidence_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"iso2" text NOT NULL,
	"name" text NOT NULL,
	"eu_high_risk" boolean DEFAULT false NOT NULL,
	"fatf_status" text DEFAULT 'none' NOT NULL,
	"eu_sanctions" boolean DEFAULT false NOT NULL,
	"us_sanctions" boolean DEFAULT false NOT NULL,
	"org_stance" text DEFAULT 'allowed' NOT NULL,
	"corridor_status" text DEFAULT 'none' NOT NULL,
	"corridor_notes" text,
	"legal_notes" text,
	"reviewed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdictions_organizationId_iso2_unique" UNIQUE("organization_id","iso2")
);
--> statement-breakpoint
ALTER TABLE "jurisdictions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "obligation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"due_at" date NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"evidence_id" uuid,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"note" text,
	CONSTRAINT "obligation_runs_obligationId_periodLabel_unique" UNIQUE("obligation_id","period_label")
);
--> statement-breakpoint
ALTER TABLE "obligation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"legal_basis" text,
	"framework_id" uuid,
	"frequency" text NOT NULL,
	"due_rule" jsonb,
	"recipient" text DEFAULT 'intern' NOT NULL,
	"owner_user_id" uuid,
	"lead_days" integer DEFAULT 14 NOT NULL,
	"applies_from_stage" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligations_organizationId_code_unique" UNIQUE("organization_id","code")
);
--> statement-breakpoint
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "own_funds_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"micar_class" integer,
	"micar_min_capital" numeric(18, 2),
	"fixed_overheads_prev_year" numeric(18, 2),
	"micar_required" numeric(18, 2),
	"zag_method" text,
	"monthly_payment_volume" numeric(18, 2),
	"zag_required" numeric(18, 2),
	"zag_initial_capital" numeric(18, 2),
	"total_required" numeric(18, 2),
	"available_own_funds" numeric(18, 2),
	"buffer" numeric(18, 2),
	"risk_bearing_capacity" jsonb,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"evidence_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "own_funds_calculations_organizationId_periodLabel_unique" UNIQUE("organization_id","period_label")
);
--> statement-breakpoint
ALTER TABLE "own_funds_calculations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"data_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"third_country_transfer" text,
	"retention" text,
	"legal_basis" text,
	"dsfa_required" boolean DEFAULT false NOT NULL,
	"dsfa_evidence_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processing_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shareholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_legal_person" boolean DEFAULT false NOT NULL,
	"share_pct" numeric(5, 2),
	"voting_pct" numeric(5, 2),
	"ubo_chain" text,
	"inhaberkontrolle_status" text DEFAULT 'not_required' NOT NULL,
	"threshold_crossed" integer,
	"notified_at" date,
	"approved_at" date,
	"source_of_funds_evidence_id" uuid,
	"sanctions_checked_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shareholders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suspicious_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text DEFAULT 'gwg_sar' NOT NULL,
	"internal_ref" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"external_ref" text,
	"category" text,
	"hold_until" timestamp with time zone,
	"decision_note" text,
	"status" text DEFAULT 'review' NOT NULL,
	"incident_id" uuid,
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suspicious_reports_organizationId_internalRef_unique" UNIQUE("organization_id","internal_ref")
);
--> statement-breakpoint
ALTER TABLE "suspicious_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" text,
	"impersonated_by" text,
	"mfa_verified_at" timestamp,
	"last_active_at" timestamp,
	"step_up_at" timestamp,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" uuid NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_requirements" ADD CONSTRAINT "control_requirements_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_requirements" ADD CONSTRAINT "control_requirements_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_sections" ADD CONSTRAINT "framework_sections_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frameworks" ADD CONSTRAINT "frameworks_successor_framework_id_frameworks_id_fk" FOREIGN KEY ("successor_framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_section_id_framework_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."framework_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_access" ADD CONSTRAINT "member_access_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_access" ADD CONSTRAINT "member_access_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_access" ADD CONSTRAINT "member_access_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_frameworks" ADD CONSTRAINT "org_frameworks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_frameworks" ADD CONSTRAINT "org_frameworks_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_frameworks" ADD CONSTRAINT "org_frameworks_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_snapshots" ADD CONSTRAINT "posture_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_snapshots" ADD CONSTRAINT "posture_snapshots_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_raci" ADD CONSTRAINT "process_raci_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_raci" ADD CONSTRAINT "process_raci_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_raci" ADD CONSTRAINT "process_raci_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_deputy_user_id_user_id_fk" FOREIGN KEY ("deputy_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes" ADD CONSTRAINT "processes_parent_process_id_processes_id_fk" FOREIGN KEY ("parent_process_id") REFERENCES "public"."processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approver_user_id_user_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_evidence" ADD CONSTRAINT "control_evidence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_evidence" ADD CONSTRAINT "control_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_evidence" ADD CONSTRAINT "control_evidence_impl_fk" FOREIGN KEY ("implementation_id") REFERENCES "public"."control_implementations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_implementations" ADD CONSTRAINT "control_implementations_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_implementation_id_control_implementations_id_fk" FOREIGN KEY ("implementation_id") REFERENCES "public"."control_implementations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_tester_user_id_user_id_fk" FOREIGN KEY ("tester_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_acknowledgements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_acknowledgements" ADD CONSTRAINT "document_ack_version_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_controls" ADD CONSTRAINT "document_controls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_controls" ADD CONSTRAINT "document_controls_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_controls" ADD CONSTRAINT "document_controls_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_processes" ADD CONSTRAINT "document_processes_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_evidence_id_evidence_id_fk" FOREIGN KEY ("file_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_evidence_id_evidence_id_fk" FOREIGN KEY ("file_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedes_document_id_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_supersedes_id_evidence_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_events" ADD CONSTRAINT "loss_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_events" ADD CONSTRAINT "loss_events_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_events" ADD CONSTRAINT "loss_events_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loss_events" ADD CONSTRAINT "loss_events_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_controls" ADD CONSTRAINT "milestone_controls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_controls" ADD CONSTRAINT "milestone_controls_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_controls" ADD CONSTRAINT "milestone_controls_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_assets" ADD CONSTRAINT "process_assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_assets" ADD CONSTRAINT "process_assets_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_assets" ADD CONSTRAINT "process_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_controls" ADD CONSTRAINT "process_controls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_controls" ADD CONSTRAINT "process_controls_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_controls" ADD CONSTRAINT "process_controls_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_providers" ADD CONSTRAINT "process_providers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_providers" ADD CONSTRAINT "process_providers_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_providers" ADD CONSTRAINT "process_providers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_risks" ADD CONSTRAINT "process_risks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_risks" ADD CONSTRAINT "process_risks_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_risks" ADD CONSTRAINT "process_risks_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability" ADD CONSTRAINT "requirement_applicability_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_applicability" ADD CONSTRAINT "requirement_applicability_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_minutes_evidence_id_evidence_id_fk" FOREIGN KEY ("minutes_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assets" ADD CONSTRAINT "risk_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_controls" ADD CONSTRAINT "risk_controls_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_treatments" ADD CONSTRAINT "risk_treatments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_treatments" ADD CONSTRAINT "risk_treatments_risk_id_risks_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_treatments" ADD CONSTRAINT "risk_treatments_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_treatments" ADD CONSTRAINT "risk_treatments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_bundles" ADD CONSTRAINT "task_bundles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_requirement_id_training_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."training_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_trainer_user_id_user_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchers" ADD CONSTRAINT "watchers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_nonconformity_id_nonconformities_id_fk" FOREIGN KEY ("nonconformity_id") REFERENCES "public"."nonconformities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programme_items" ADD CONSTRAINT "audit_programme_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programme_items" ADD CONSTRAINT "audit_programme_items_programme_id_audit_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."audit_programmes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programme_items" ADD CONSTRAINT "audit_programme_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programmes" ADD CONSTRAINT "audit_programmes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_programmes" ADD CONSTRAINT "audit_programmes_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_requests" ADD CONSTRAINT "audit_requests_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_programme_id_audit_programmes_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."audit_programmes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_auditor_user_id_user_id_fk" FOREIGN KEY ("auditor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_report_evidence_id_evidence_id_fk" FOREIGN KEY ("report_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_interested_party_id_interested_parties_id_fk" FOREIGN KEY ("interested_party_id") REFERENCES "public"."interested_parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_template_document_id_documents_id_fk" FOREIGN KEY ("template_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_related_risk_id_risks_id_fk" FOREIGN KEY ("related_risk_id") REFERENCES "public"."risks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_issues" ADD CONSTRAINT "context_issues_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interested_parties" ADD CONSTRAINT "interested_parties_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interested_parties" ADD CONSTRAINT "interested_parties_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_measurements" ADD CONSTRAINT "kpi_measurements_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_minutes_evidence_id_evidence_id_fk" FOREIGN KEY ("minutes_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_reviews" ADD CONSTRAINT "management_reviews_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulator_interactions" ADD CONSTRAINT "regulator_interactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulator_interactions" ADD CONSTRAINT "regulator_interactions_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulator_interactions" ADD CONSTRAINT "regulator_interactions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_deputy_user_id_user_id_fk" FOREIGN KEY ("deputy_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whistleblowing_reports" ADD CONSTRAINT "whistleblowing_reports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_monitoring_rules" ADD CONSTRAINT "aml_monitoring_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_monitoring_rules" ADD CONSTRAINT "aml_monitoring_rules_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" ADD CONSTRAINT "aml_risk_analyses_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" ADD CONSTRAINT "aml_risk_analyses_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" ADD CONSTRAINT "aml_risk_analyses_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" ADD CONSTRAINT "aml_risk_analyses_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_assets" ADD CONSTRAINT "crypto_assets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_runs" ADD CONSTRAINT "obligation_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_runs" ADD CONSTRAINT "obligation_runs_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_runs" ADD CONSTRAINT "obligation_runs_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_runs" ADD CONSTRAINT "obligation_runs_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_funds_calculations" ADD CONSTRAINT "own_funds_calculations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_funds_calculations" ADD CONSTRAINT "own_funds_calculations_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "own_funds_calculations" ADD CONSTRAINT "own_funds_calculations_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_dsfa_evidence_id_evidence_id_fk" FOREIGN KEY ("dsfa_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_source_of_funds_evidence_id_evidence_id_fk" FOREIGN KEY ("source_of_funds_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_reports" ADD CONSTRAINT "suspicious_reports_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_reports" ADD CONSTRAINT "suspicious_reports_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspicious_reports" ADD CONSTRAINT "suspicious_reports_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_requirements_requirement_idx" ON "control_requirements" USING btree ("requirement_id");--> statement-breakpoint
CREATE INDEX "requirements_domain_idx" ON "requirements" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "audit_log_org_seq_idx" ON "audit_log" USING btree ("organization_id","seq");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "assets_org_idx" ON "assets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "process_raci_process_idx" ON "process_raci" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "providers_org_idx" ON "providers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approval_decisions_request_idx" ON "approval_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "approval_requests_entity_idx" ON "approval_requests" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "approval_requests_status_idx" ON "approval_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "control_impl_org_status_idx" ON "control_implementations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "control_tests_impl_idx" ON "control_tests" USING btree ("implementation_id");--> statement-breakpoint
CREATE INDEX "delegations_from_idx" ON "delegations" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "documents_org_status_idx" ON "documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "evidence_org_idx" ON "evidence" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "exceptions_org_idx" ON "exceptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "incident_updates_incident_idx" ON "incident_updates" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incidents_org_status_idx" ON "incidents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "loss_events_org_idx" ON "loss_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "milestones_org_idx" ON "milestones" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "risk_treatments_risk_idx" ON "risk_treatments" USING btree ("risk_id");--> statement-breakpoint
CREATE INDEX "risks_org_status_idx" ON "risks" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "tasks_assignee_status_idx" ON "tasks" USING btree ("assignee_user_id","status");--> statement-breakpoint
CREATE INDEX "tasks_entity_idx" ON "tasks" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "training_assignments_user_idx" ON "training_assignments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "trainings_org_idx" ON "trainings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_findings_audit_idx" ON "audit_findings" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_programme_items_programme_idx" ON "audit_programme_items" USING btree ("programme_id");--> statement-breakpoint
CREATE INDEX "audit_programmes_org_idx" ON "audit_programmes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_requests_audit_idx" ON "audit_requests" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_org_idx" ON "audits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "communications_org_idx" ON "communications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conflicts_org_idx" ON "conflicts_of_interest" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "context_issues_org_idx" ON "context_issues" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dsr_org_idx" ON "data_subject_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "interested_parties_org_idx" ON "interested_parties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "kpi_measurements_objective_idx" ON "kpi_measurements" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "management_reviews_org_idx" ON "management_reviews" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "objectives_org_idx" ON "objectives" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "regulator_interactions_org_idx" ON "regulator_interactions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "role_assignments_org_function_idx" ON "role_assignments" USING btree ("organization_id","function");--> statement-breakpoint
CREATE INDEX "scopes_org_idx" ON "scopes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "insurance_policies_org_idx" ON "insurance_policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligation_runs_due_idx" ON "obligation_runs" USING btree ("organization_id","due_at");--> statement-breakpoint
CREATE INDEX "processing_activities_org_idx" ON "processing_activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "shareholders_org_idx" ON "shareholders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE POLICY "audit_log_select" ON "audit_log" AS PERMISSIVE FOR SELECT TO public USING (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audit_log_insert" ON "audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "member_access_org" ON "member_access" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "notifications_org" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "org_frameworks_org" ON "org_frameworks" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "org_settings_org" ON "org_settings" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "posture_snapshots_org" ON "posture_snapshots" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "assets_org" ON "assets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "process_raci_org" ON "process_raci" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "processes_org" ON "processes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "providers_org" ON "providers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "approval_decisions_org" ON "approval_decisions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "approval_requests_org" ON "approval_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "approval_workflows_org" ON "approval_workflows" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "comments_org" ON "comments" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "control_evidence_org" ON "control_evidence" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "control_implementations_org" ON "control_implementations" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "control_tests_org" ON "control_tests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "delegations_org" ON "delegations" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_acknowledgements_org" ON "document_acknowledgements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_controls_org" ON "document_controls" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_processes_org" ON "document_processes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_requirements_org" ON "document_requirements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "document_versions_org" ON "document_versions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "documents_org" ON "documents" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "evidence_org" ON "evidence" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "exceptions_org" ON "exceptions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "incident_updates_org" ON "incident_updates" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "incidents_org" ON "incidents" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "loss_events_org" ON "loss_events" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "milestone_controls_org" ON "milestone_controls" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "milestones_org" ON "milestones" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "process_assets_org" ON "process_assets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "process_controls_org" ON "process_controls" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "process_providers_org" ON "process_providers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "process_risks_org" ON "process_risks" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "requirement_applicability_org" ON "requirement_applicability" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "resolutions_org" ON "resolutions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "risk_assets_org" ON "risk_assets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "risk_controls_org" ON "risk_controls" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "risk_treatments_org" ON "risk_treatments" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "risks_org" ON "risks" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "task_bundles_org" ON "task_bundles" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "tasks_org" ON "tasks" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "training_assignments_org" ON "training_assignments" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "training_requirements_org" ON "training_requirements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "trainings_org" ON "trainings" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "watchers_org" ON "watchers" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audit_findings_org" ON "audit_findings" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audit_programme_items_org" ON "audit_programme_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audit_programmes_org" ON "audit_programmes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audit_requests_org" ON "audit_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "audits_org" ON "audits" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "communications_org" ON "communications" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "complaints_org" ON "complaints" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "conflicts_of_interest_org" ON "conflicts_of_interest" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "context_issues_org" ON "context_issues" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "data_subject_requests_org" ON "data_subject_requests" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "interested_parties_org" ON "interested_parties" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "kpi_measurements_org" ON "kpi_measurements" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "management_reviews_org" ON "management_reviews" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "nonconformities_org" ON "nonconformities" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "objectives_org" ON "objectives" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "regulator_interactions_org" ON "regulator_interactions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "role_assignments_org" ON "role_assignments" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "scopes_org" ON "scopes" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "whistleblowing_reports_org" ON "whistleblowing_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "aml_monitoring_rules_org" ON "aml_monitoring_rules" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "aml_risk_analyses_org" ON "aml_risk_analyses" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "crypto_assets_org" ON "crypto_assets" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "insurance_policies_org" ON "insurance_policies" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "jurisdictions_org" ON "jurisdictions" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "obligation_runs_org" ON "obligation_runs" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "obligations_org" ON "obligations" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "own_funds_calculations_org" ON "own_funds_calculations" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "processing_activities_org" ON "processing_activities" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "shareholders_org" ON "shareholders" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
CREATE POLICY "suspicious_reports_org" ON "suspicious_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = app_current_org() or app_is_platform()) WITH CHECK (organization_id = app_current_org() or app_is_platform());--> statement-breakpoint
-- ═══════════════════════════════════════════════════════════════════════════
-- Block C — FORCE RLS (gilt auch für den Tabellen-Owner), Carry-over der
-- Admins und CMS-Texte, Append-only-Trigger für audit_log.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "aml_monitoring_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "aml_risk_analyses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_decisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approval_workflows" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_findings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_programme_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_programmes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "complaints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conflicts_of_interest" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "context_issues" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "control_evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "control_implementations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "control_tests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_subject_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "delegations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_acknowledgements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_controls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_processes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_requirements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exceptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incident_updates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "incidents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "insurance_policies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "interested_parties" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jurisdictions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_measurements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "loss_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "management_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_access" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestone_controls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestones" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nonconformities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "objectives" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "obligation_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "obligations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_frameworks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "own_funds_calculations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "posture_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "process_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "process_controls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "process_providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "process_raci" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "process_risks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_activities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "regulator_interactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "requirement_applicability" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resolutions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_controls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risk_treatments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "risks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scopes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shareholders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suspicious_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_bundles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_requirements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trainings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watchers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whistleblowing_reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "user" (id, email, name, email_verified, role, created_at, updated_at)
  SELECT id::uuid, email, coalesce(name, split_part(email, '@', 1)), email_verified IS NOT NULL, 'admin', coalesce(created_at, now()), now()
  FROM legacy_admins
  ON CONFLICT (email) DO NOTHING;
--> statement-breakpoint
INSERT INTO "cms_pages" (slug, title, body, updated_at)
  SELECT slug, title, body, coalesce(updated_at, now()) FROM legacy_cms
  ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutation BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
