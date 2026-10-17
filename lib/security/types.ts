import type {
	FindingCategory,
	FindingSeverity,
	ScanTool,
} from "@/db/schema/enums";

// Normalisierte Befunde aus allen Scan-Formaten (SARIF, Trivy, ZAP, OSV,
// Nuclei, gitleaks, Schnellcheck). Parser liefern nur diese Form; Secrets
// sind hier schon redigiert — der Klartext verlässt den Parser nie.

export type NormalizedFinding = {
	ruleId: string;
	title: string;
	severity: FindingSeverity;
	category: FindingCategory;
	// Datei:Zeile, URL oder Paket — ohne Secret-Inhalt
	location: string | null;
	cwe: string | null;
	cve: string | null;
	cvss: number | null;
	description: string | null;
	remediation: string | null;
	package: {
		name: string;
		version: string | null;
		fixed: string | null;
	} | null;
	// redigierter Ausschnitt (Secrets: Präfix + Länge), nie Klartext
	evidence: string | null;
	// vom Tool geliefert (SARIF partialFingerprints) — stabiler als Zeilen
	toolFingerprint: string | null;
};

export type ParsedScan = {
	tool: ScanTool;
	toolName: string | null;
	target: string | null;
	findings: NormalizedFinding[];
};

export const emptyFinding = (
	over: Partial<NormalizedFinding> &
		Pick<NormalizedFinding, "ruleId" | "title" | "severity" | "category">,
): NormalizedFinding => ({
	location: null,
	cwe: null,
	cve: null,
	cvss: null,
	description: null,
	remediation: null,
	package: null,
	evidence: null,
	toolFingerprint: null,
	...over,
});
