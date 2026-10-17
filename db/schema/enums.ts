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
	// CRA-Wirtschaftsakteure — aus dem Produktregister abgeleitet, unabhängig
	// von der Lizenzstufe.
	"manufacturer",
	"importer",
	"distributor",
	"oss_steward",
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

// Fragebögen (Gap-Analyse, Lieferantenbewertung, Produkt-Checklisten).
export const ASSESSMENT_KINDS = [
	"self",
	"supplier",
	"product",
	"engagement",
] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_STATUS = [
	"draft",
	"in_progress",
	"submitted",
	"in_review",
	"completed",
	"cancelled",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUS)[number];

// Antwort je Frage. „unknown“ = weiß ich (noch) nicht → Klärungsbedarf.
export const ASSESSMENT_ANSWERS = [
	"yes",
	"partial",
	"no",
	"unknown",
	"na",
] as const;
export type AssessmentAnswer = (typeof ASSESSMENT_ANSWERS)[number];

// Fragen-Schnappschuss am Fragebogen (Berichte bleiben reproduzierbar, auch
// wenn sich der Katalog ändert).
export type AssessmentQuestion = {
	code: string;
	sectionCode: string;
	sectionTitle: string;
	text: string;
	help?: string;
	// Prüffragen, wie sie Prüfer:innen stellen würden (Hilfe beim Antworten)
	probes?: string[];
	// Gap-Analyse aus dem Katalog: die Frage steht für ein Control
	controlCode?: string;
	requirements?: string[];
	frameworks?: string[];
	weight: number;
	critical?: boolean;
	evidenceRequired?: boolean;
	evidenceHints?: string[];
	templates?: string[];
	mapsTo?: { art30?: string[]; control?: string; requirement?: string };
};

// Produktregister (CRA): Art des Produkts, Rolle der Org, Einstufung nach
// Anhang III/IV, Lebenszyklus.
export const PRODUCT_KINDS = [
	"software",
	"mobile_app",
	"library",
	"firmware",
	"hardware",
	"saas",
	"other",
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_ROLES = [
	"manufacturer",
	"importer",
	"distributor",
	"oss_steward",
] as const;
export type ProductRole = (typeof PRODUCT_ROLES)[number];

export const CRA_CLASSES = [
	"default",
	"important_1",
	"important_2",
	"critical",
] as const;
export type CraClass = (typeof CRA_CLASSES)[number];

export const PRODUCT_STATUS = [
	"development",
	"on_market",
	"end_of_support",
	"withdrawn",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

// Zusammenfassung einer SBOM (products.sbomSummary) — nie die Komponenten
// selbst, die liegen verschlüsselt im Nachweis.
export type SbomSummary = {
	format: "cyclonedx" | "spdx";
	specVersion: string | null;
	generatedAt: string | null;
	primaryComponent: string | null;
	components: number;
	// Anteil der Komponenten mit Pflichtfeld nach BSI TR-03183-2 (0–100)
	fields: {
		version: number;
		identifier: number;
		license: number;
		hash: number;
		supplier: number;
	};
	dependencies: boolean;
	issues: string[];
	ok: boolean;
	checkedAt: string;
};

// Security-Checks (S5): Befunde aus Scan-Import, API-Ingest, Schnellcheck
// und Pentests. Schwere nach CVSS-Bändern, Kategorie steuert das Control.
export const FINDING_SEVERITIES = [
	"critical",
	"high",
	"medium",
	"low",
	"info",
] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_CATEGORIES = [
	"dependency",
	"secret",
	"code",
	"config",
	"web",
	"tls",
	"dns",
	"exposure",
	"other",
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_STATUS = [
	"open",
	"in_progress",
	"accepted",
	"resolved",
	"false_positive",
] as const;
export type FindingStatus = (typeof FINDING_STATUS)[number];

export const SCAN_TOOLS = [
	"sarif",
	"trivy",
	"zap",
	"osv",
	"nuclei",
	"gitleaks",
	"quick_check",
] as const;
export type ScanTool = (typeof SCAN_TOOLS)[number];

export const SCAN_SOURCES = ["upload", "api", "quick_check"] as const;

// Token ohne Sitzung (ADR-017): CI-Ingest und Lieferantenportal.
export const ACCESS_TOKEN_KINDS = ["ingest", "supplier_portal"] as const;
export type AccessTokenKind = (typeof ACCESS_TOKEN_KINDS)[number];
export const INGEST_SCOPES = ["scan:write", "sbom:write"] as const;
export type IngestScope = (typeof INGEST_SCOPES)[number];
export type ScanSource = (typeof SCAN_SOURCES)[number];

// Zähler je Scan (security_scans.counts).
export type ScanCounts = Record<FindingSeverity, number> & {
	new: number;
	reopened: number;
	resolved: number;
};

// Herkunft eines Nachweises (evidence.source).
export const EVIDENCE_SOURCES = [
	"manual",
	"assessment",
	"scan_import",
	"api_ingest",
	"quick_check",
	"sbom",
	"supplier_portal",
	"engagement",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

// DLP-Ergebnis am Nachweis — nur Zähler, nie Inhalt.
export type EvidenceDlp = {
	engine: string;
	scannedAt: string;
	extraction: "ok" | "unsupported" | "error";
	truncated?: boolean;
	findings: { detector: string; category: string; count: number }[];
	action: "allow" | "raise" | "warn" | "block";
	acknowledged?: boolean;
	declaredClassification?: string;
};

export const CLASSIFICATIONS = [
	"public",
	"internal",
	"confidential",
	"secret",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CRITICALITY = ["critical", "important", "standard"] as const;

// Priorität einer Abweichung — setzt nur die Geschäftsleitung.
export const NC_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type NcPriority = (typeof NC_PRIORITIES)[number];

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
	"assessment",
	"product",
	"security_finding",
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

export const INCIDENT_REGIMES = [
	"dora",
	"nis2",
	"cra_vuln",
	"cra_incident",
	"dsgvo",
	"gwg_sar",
] as const;
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
