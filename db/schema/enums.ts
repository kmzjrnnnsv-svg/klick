// Geteilte Literal-Unions. Bewusst Text-Spalten statt pg-Enums: neue Werte
// brauchen keine Migration, Drizzle liefert trotzdem enge TS-Typen.

export const DOMAINS = [
	"governance",
	"risk",
	"asset",
	"access",
	"crypto",
	"physical",
	"operations",
	"network",
	"development",
	"supplier",
	"incident",
	"continuity",
	"compliance",
	"hr",
	"aml",
	"conduct",
	"payments",
	"custody",
	"fraud",
] as const;
export type Domain = (typeof DOMAINS)[number];

export const CASP_SERVICES = [
	"custody",
	"exchange",
	"transfer",
	"fiat_onramp",
	"platform",
	"execution",
	"placing",
	"reception_transmission",
	"advice",
	"portfolio",
] as const;
export type CaspService = (typeof CASP_SERVICES)[number];

export const LICENCE_STAGES = [
	"0_vorbereitung",
	"1_agent",
	"2_casp_zag",
	"3_emi",
	"4_bank",
] as const;
export type LicenceStage = (typeof LICENCE_STAGES)[number];

export const ORG_ROLES_LEGAL = [
	"financial_entity",
	"agent",
	"ict_provider",
	"aml_obliged",
	"issuer",
	"any",
] as const;
export type OrgRoleLegal = (typeof ORG_ROLES_LEGAL)[number];

export const LEGAL_STATUS = [
	"in_force",
	"upcoming",
	"draft",
	"repealed",
] as const;
export type LegalStatus = (typeof LEGAL_STATUS)[number];

export const EFFORTS = ["S", "M", "L"] as const;
export const CONTROL_KINDS = [
	"technical",
	"organizational",
	"documentation",
	"process",
] as const;
export const COVERAGE = ["full", "partial"] as const;

export const IMPL_STATUS = [
	"not_started",
	"planned",
	"in_progress",
	"implemented",
	"not_applicable",
] as const;
export type ImplStatus = (typeof IMPL_STATUS)[number];

export const CLASSIFICATIONS = [
	"public",
	"internal",
	"confidential",
	"secret",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CRITICALITY = ["critical", "important", "standard"] as const;

// Polymorphe Verknüpfung (Kommentare, Aufgaben, Watcher, Freigaben, Historie).
// Textspalte + Union statt pg-Enum, damit neue Entitäten keine Migration
// brauchen; Zod validiert gegen diese Liste.
export const ENTITY_KINDS = [
	"control",
	"risk",
	"document",
	"process",
	"incident",
	"provider",
	"asset",
	"milestone",
	"evidence",
	"task",
	"resolution",
	"exception",
	"loss_event",
	"complaint",
	"whistleblowing_report",
	"audit",
	"audit_finding",
	"audit_request",
	"nonconformity",
	"training",
	"communication",
	"regulator_interaction",
	"objective",
	"obligation_run",
	"data_subject_request",
	"scope",
	"role_assignment",
	"interested_party",
	"context_issue",
	"management_review",
	"aml_risk_analysis",
	"aml_monitoring_rule",
	"suspicious_report",
	"jurisdiction",
	"own_funds_calculation",
	"crypto_asset",
	"shareholder",
	"insurance_policy",
	"processing_activity",
	"organization",
	"member",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ROLE_FUNCTIONS = [
	"management_body",
	"isb_ciso",
	"ict_risk_function",
	"compliance",
	"compliance_manager",
	"internal_audit",
	"risk_control",
	"aml_officer",
	"dpo",
	"bcm_manager",
	"incident_manager",
	"nis2_responsible",
	"outsourcing_officer",
	"crisis_team",
	"other",
] as const;
export type RoleFunction = (typeof ROLE_FUNCTIONS)[number];

export const CONTROL_TEST_METHODS = [
	"interview",
	"inspection",
	"reperformance",
	"automated",
	"vuln_scan",
	"pentest",
	"bcm_exercise",
	"tlpt",
	"access_review",
] as const;
export type ControlTestMethod = (typeof CONTROL_TEST_METHODS)[number];

export const INCIDENT_REGIMES = ["dora", "nis2", "dsgvo", "gwg_sar"] as const;
export type IncidentRegime = (typeof INCIDENT_REGIMES)[number];

export const NOTIFICATION_KINDS = [
	"review_due",
	"incident_deadline",
	"approval_requested",
	"approval_decided",
	"approval_overdue",
	"acknowledgement_due",
	"milestone_due",
	"evidence_expiring",
	"task_assigned",
	"mentioned",
	"entity_changed",
	"risk_above_appetite",
	"audit_request",
	"security_alert",
	"digest",
	"system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
