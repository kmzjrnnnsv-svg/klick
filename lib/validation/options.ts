// Auswahlwerte der Formulare ohne zod: Browser-Bausteine importieren von hier,
// die Schemas in lib/validation/* re-exportieren sie (Leistung, Test client-boundary).

export const CORRIDOR_STATUSES = [
	"none",
	"evaluating",
	"pilot",
	"active",
	"suspended",
] as const;

// ── Länder & Korridore ─────────────────────────────────────────────────────
export const FATF_STATUSES = ["none", "grey", "black"] as const;

// ── Monitoring-Regelwerk ───────────────────────────────────────────────────
export const MONITORING_RULE_STATUSES = [
	"active",
	"paused",
	"retired",
] as const;

export const ORG_STANCES = ["allowed", "enhanced_dd", "blocked"] as const;

// ── Verdachtsmeldungen (§ 43 GwG) und STOR (Art. 92 MiCAR) ────────────────
export const SUSPICIOUS_KINDS = ["gwg_sar", "micar_stor"] as const;

export const AUDIT_STATUSES = [
	"planned",
	"in_progress",
	"reported",
	"closed",
] as const;

export const AUDIT_TYPES = [
	"internal",
	"external",
	"certification",
	"regulator",
] as const;

export const FINDING_SEVERITIES = [
	"observation",
	"minor",
	"major",
	"critical",
] as const;

export const FINDING_STATUSES = [
	"open",
	"accepted",
	"in_remediation",
	"closed",
] as const;

// ── Prüfer-Zugang ──────────────────────────────────────────────────────────
export const ACCESS_GRANTS = [
	"aml_detail",
	"hr_detail",
	"whistleblowing_detail",
	"complaints_detail",
	"secret_evidence",
	// Entwürfe, Arbeitskopien und ersetzte Fassungen (lib/auth/visibility.ts)
	"work_in_progress",
] as const;

// ── Abweichungen (CAPA) ────────────────────────────────────────────────────
export const NC_SOURCES = [
	"audit",
	"incident",
	"control_test",
	"complaint",
	"management_review",
	"self_identified",
	"security_finding",
	"custody_reconciliation",
] as const;

export const AUTHORITIES = [
	"bafin",
	"bundesbank",
	"bsi",
	"fiu",
	"dsb",
	"esma",
	"eba",
	"other",
] as const;

export const PARTY_TYPES = [
	"regulator",
	"customer",
	"employee",
	"supplier",
	"shareholder",
	"partner",
	"public",
	"community",
] as const;

export const DSR_TYPES = [
	"auskunft",
	"loeschung",
	"berichtigung",
	"widerspruch",
	"portabilitaet",
	"einschraenkung",
] as const;

export const INSURANCE_TYPES = [
	"do",
	"cyber",
	"crime",
	"crypto_custody",
	"liability",
] as const;

export const TRAINING_ORG_ROLES = [
	"all",
	"owner",
	"editor",
	"viewer",
	"auditor",
] as const;
