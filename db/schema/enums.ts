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
	// manuell erfasst (Pentest, Sicherheitsprüfung)
	"manual",
] as const;
export type ScanTool = (typeof SCAN_TOOLS)[number];

// Preise (Admin-CMS): Stufe je Preisgruppe, Art je Position.
export const PRICE_LEVELS = ["entry", "market", "premium", "custom"] as const;
export type PriceLevel = (typeof PRICE_LEVELS)[number];
export const PRICE_MODES = ["from", "fixed", "on_request"] as const;
export type PriceMode = (typeof PRICE_MODES)[number];

// Anfragen (Formular auf /leistungen, „Leistung anfragen“ in der App).
export const INQUIRY_SOURCES = ["public", "app"] as const;
export type InquirySource = (typeof INQUIRY_SOURCES)[number];
export const INQUIRY_STATUS = ["new", "contacted", "closed", "spam"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUS)[number];

// Sicherheitsaufträge (S7): Pentest, Security-Check, Schnellcheck-Auftrag,
// CRA-Readiness — manuell durchgeführt, in Klick verwaltet.
export const ENGAGEMENT_KINDS = [
	"pentest",
	"security_check",
	"quick_check",
	"cra_readiness",
] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export const ENGAGEMENT_STATUS = [
	"planned",
	"authorized",
	"in_progress",
	"reporting",
	"delivered",
	"retest",
	"closed",
	"cancelled",
] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUS)[number];

export const RETEST_STATUS = ["pending", "passed", "failed"] as const;
export type RetestStatus = (typeof RETEST_STATUS)[number];

export const SCAN_SOURCES = ["upload", "api", "quick_check"] as const;

// Token ohne Sitzung (ADR-017): CI-Ingest und Lieferantenportal.
export const ACCESS_TOKEN_KINDS = [
	"ingest",
	"supplier_portal",
	"trust_center",
	// both.money → Klick (Plan both.money, K2): Subjekt = wallet_links.id
	"wallet",
	// Richtlinien-Portal (M2): Subjekt = policy_readers.id
	"policy_reader",
] as const;
export type AccessTokenKind = (typeof ACCESS_TOKEN_KINDS)[number];
export const INGEST_SCOPES = ["scan:write", "sbom:write"] as const;
export type IngestScope = (typeof INGEST_SCOPES)[number];
// Lieferantenportal: Token gilt für genau einen Fragebogen (subject).
export const PORTAL_SCOPES = ["assessment:answer"] as const;
export const WALLET_LINK_SCOPES = ["wallet:push"] as const;
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
	"decision_request",
	// Nachweis-Werkstatt: von Klick aus Registern erzeugt
	"klick",
	// in Klick verfasst (Rohling)
	"authored",
	// Datei einer Dokumentfassung (Dokumente, hochgeladen am Dokument)
	"document",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

// Nachweisbogen je Control (lib/evidence-studio/sheet.ts): Antworten auf
// Prüffragen und Belege je Position, an stabilen IDs; eigene Fristen je
// Rahmenwerk. Einmal je Control — gilt für jedes Rahmenwerk.
export type ControlSheetState = {
	answers?: Record<
		string,
		{
			answer: "yes" | "partial" | "no" | "na";
			note?: string;
			evidenceIds?: string[];
			updatedAt?: string;
			byUserId?: string;
		}
	>;
	items?: Record<
		string,
		{
			mode: "kind" | "document" | "evidence" | "text";
			note?: string;
			evidenceIds?: string[];
			documentId?: string;
			updatedAt?: string;
			byUserId?: string;
		}
	>;
	ownParams?: { framework: string; topic: string; value: number }[];
};

export const FOLLOW_UP_CLASSES = ["major", "minor", "observation"] as const;
export type FollowUpClassDb = (typeof FOLLOW_UP_CLASSES)[number];

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
// Neu-Produkt-Prozess und wesentliche Änderungen (MaRisk AT 8)
export const CHANGE_KINDS = [
	"product",
	"market",
	"channel",
	"it_change",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export const CHANGE_STATUS = [
	"pending",
	"approved",
	"rejected",
	"withdrawn",
] as const;

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
	"security_engagement",
	"provider_rating",
	// Katalog-Anforderung (requirements.id) — nur als Herkunft/Bezug
	"requirement",
	// Entscheidung beim Management angefragt (E2)
	"decision_request",
	// Standort (D2)
	"site",
	// Verwahrung: Wallet, tägliche Abstimmung des Kundenvermögens
	"wallet",
	"custody_reconciliation",
	// Schlüsselinhaber:in einer Wallet (Bestellung CCSS 1.06)
	"wallet_key_holder",
	// Neues Produkt oder wesentliche Änderung (ZAG-MaRisk AT 8)
	"change_request",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ROLE_FUNCTIONS = [
	"management_body",
	// Zwischenstufe für Freigaben (B4), z. B. mittlere Risiken
	"department_head",
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
// Funktionsschlüssel (ADR-024): Katalog-Funktion oder eigene Rolle `role:<id>`
export type FunctionKey = RoleFunction | `role:${string}`;

// Bestellung einer Funktion durch die Geschäftsleitung (role_assignments):
// wirksam sind nur appointed und revocation_requested (Abberufung beantragt,
// gilt bis zur Freigabe weiter)
export const APPOINTMENT_STATUS = [
	"proposed",
	"appointed",
	"rejected",
	"revocation_requested",
	"revoked",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];

// Standard (Freigaben und Funktionen nach Rahmenwerk) oder individuell
// (eigene Rollen, Abläufe frei, Pflichten als Warnung) — ADR-024
export const GOVERNANCE_MODES = ["standard", "individual"] as const;
export type GovernanceMode = (typeof GOVERNANCE_MODES)[number];

// Berichte an die Geschäftsleitung (N3, management_reports)
export const MANAGEMENT_REPORT_KINDS = [
	"isms",
	"ict_risk",
	"aml",
	"compliance",
	"privacy",
	"outsourcing",
	"other",
] as const;
export type ManagementReportKind = (typeof MANAGEMENT_REPORT_KINDS)[number];

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
	"inquiry",
	// Geschäftsleitung informiert (Vorfall schwerwiegend bzw. gemeldet)
	"management_info",
	// Wallet: Eingang bestätigt bzw. Ausgang gesehen (Treffer der
	// Sanktionsprüfung laufen als security_alert)
	"wallet_transfer",
	// Lockbox: Antrag, Notfall-Zugriff, Wartezeit (sofort per Mail)
	"platform_access",
	"digest",
	"system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// Trust Center je Org: Status eines Rahmenwerks auf der öffentlichen Seite,
// Zugriff je Dokument und Stand einer Anfrage nach vertraulichen Unterlagen.
export const TRUST_FRAMEWORK_STATUS = [
	"certified",
	"in_progress",
	"planned",
	"aligned",
] as const;
export type TrustFrameworkStatus = (typeof TRUST_FRAMEWORK_STATUS)[number];
export const TRUST_DOCUMENT_ACCESS = ["public", "nda"] as const;
export type TrustDocumentAccess = (typeof TRUST_DOCUMENT_ACCESS)[number];
export const TRUST_REQUEST_STATUS = [
	"pending",
	"approved",
	"rejected",
	"revoked",
] as const;
export type TrustRequestStatus = (typeof TRUST_REQUEST_STATUS)[number];

// Lockbox (Härtung A3): Plattform-Zugriff auf Inhalte einer Org nur mit
// Freigabe der Inhaber:in bzw. Geschäftsleitung
export const PLATFORM_ACCESS_SCOPES = [
	// Protokoll der Org einsehen (Admin > Audit-Log)
	"view",
	// als eine Person der Org anmelden (Better-Auth-Impersonation)
	"impersonate",
	// Zugang einer Person zurücksetzen (Passkeys, Codes, Sitzungen)
	"reset_access",
] as const;
export type PlatformAccessScope = (typeof PLATFORM_ACCESS_SCOPES)[number];

export const PLATFORM_ACCESS_STATUS = [
	"requested",
	// Wartezeit (24 h) statt Freigabe, z. B. einzige Inhaber:in ausgesperrt
	"waiting",
	"approved",
	"denied",
	"cancelled",
	"revoked",
	// Notfall: wirkt sofort, Bericht binnen 24 h
	"emergency",
] as const;
export type PlatformAccessStatus = (typeof PLATFORM_ACCESS_STATUS)[number];

export const PLATFORM_EMERGENCY_CATEGORIES = [
	"security_incident",
	"legal_order",
] as const;
export type PlatformEmergencyCategory =
	(typeof PLATFORM_EMERGENCY_CATEGORIES)[number];
