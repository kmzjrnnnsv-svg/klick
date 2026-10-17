import type {
	FindingCategory,
	FindingSeverity,
	ScanCounts,
} from "@/db/schema/enums";
import { findingStats } from "@/lib/compliance/queries-security";
import { SEVERITY_RANK } from "@/lib/security/finding-rules";
import { remediationFor } from "@/lib/security/remediation";

// Sicherheitsbericht (Markdown) — Lieferobjekt „Security-Check“: Ampel,
// Kennzahlen, die fünf wichtigsten Maßnahmen, alle offenen Befunde je
// Kategorie, Scans im Anhang, Methode. Rein; die Route lädt und kennzeichnet.

const SEV: Record<FindingSeverity, string> = {
	critical: "kritisch",
	high: "hoch",
	medium: "mittel",
	low: "niedrig",
	info: "Hinweis",
};
const CAT: Record<FindingCategory, string> = {
	dependency: "Abhängigkeiten",
	secret: "Secrets",
	code: "Code",
	config: "Konfiguration",
	web: "Webanwendung",
	tls: "TLS",
	dns: "DNS / E-Mail",
	exposure: "Offenlegung",
	other: "Sonstiges",
};
const LIGHT = { red: "Rot", yellow: "Gelb", green: "Grün" } as const;

const cell = (v: unknown) =>
	v === null || v === undefined
		? ""
		: String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export type ReportFinding = {
	id: string;
	title: string;
	ruleId?: string;
	severity: FindingSeverity;
	category: FindingCategory;
	status: string;
	location: string | null;
	dueAt: Date | null;
	productCode: string | null;
	cve: string | null;
};

export function buildSecurityReport(input: {
	orgName: string;
	findings: readonly ReportFinding[];
	scans: readonly {
		toolName: string | null;
		tool: string;
		target: string | null;
		startedAt: Date;
		status: string;
		counts: ScanCounts | null;
	}[];
	generatedAt?: Date;
}): string {
	const now = input.generatedAt ?? new Date();
	const stats = findingStats(input.findings, now);
	const open = input.findings
		.filter((f) => f.status === "open" || f.status === "in_progress")
		.sort(
			(a, b) =>
				SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
				(a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
		);
	// Top 5 Maßnahmen: je Regelfamilie einmal, schwerste zuerst
	const seen = new Set<string>();
	const top: { f: ReportFinding; n: number }[] = [];
	for (const f of open) {
		const fam = `${f.category}:${(f.ruleId ?? f.title).replace(/-[^-]*$/, "")}`;
		if (seen.has(fam)) {
			const t = top.find(
				(x) =>
					`${x.f.category}:${(x.f.ruleId ?? x.f.title).replace(/-[^-]*$/, "")}` ===
					fam,
			);
			if (t) t.n += 1;
			continue;
		}
		seen.add(fam);
		if (top.length < 5) top.push({ f, n: 1 });
	}
	const lines: string[] = [
		"# Sicherheitsbericht",
		"",
		"| | |",
		"|---|---|",
		`| Organisation | ${cell(input.orgName)} |`,
		`| Stand | ${day(now)} |`,
		`| Ampel | **${LIGHT[stats.light]}** |`,
		`| Offene Befunde | ${stats.open} (kritisch ${stats.bySeverity.critical}, hoch ${stats.bySeverity.high}, mittel ${stats.bySeverity.medium}, niedrig ${stats.bySeverity.low}) |`,
		`| Überfällig (SLA) | ${stats.overdue} |`,
		`| Offene Secrets | ${stats.secrets} |`,
		`| Akzeptiert / behoben | ${stats.accepted} / ${stats.resolved} |`,
		"",
		"## Die wichtigsten Maßnahmen",
		"",
	];
	if (top.length === 0) lines.push("Keine offenen Befunde.", "");
	for (const [i, { f, n }] of top.entries()) {
		const r = remediationFor(f.ruleId ?? "", f.category);
		lines.push(
			`### ${i + 1}. ${f.title}${n > 1 ? ` (+${n - 1} ähnliche)` : ""}`,
			"",
			`Schwere: ${SEV[f.severity]} · Frist: ${day(f.dueAt)}${f.location ? ` · ${cell(f.location)}` : ""}`,
			"",
			r.why,
			"",
			...r.fix.map((x) => `- ${x}`),
			"",
		);
	}
	lines.push("## Offene Befunde", "");
	for (const cat of Object.keys(CAT) as FindingCategory[]) {
		const rows = open.filter((f) => f.category === cat);
		if (rows.length === 0) continue;
		lines.push(
			`### ${CAT[cat]} (${rows.length})`,
			"",
			"| Schwere | Befund | Fundstelle | Produkt | Frist |",
			"|---|---|---|---|---|",
			...rows.map(
				(f) =>
					`| ${SEV[f.severity]} | ${cell(f.title)}${f.cve ? ` (${f.cve})` : ""} | ${cell(f.location)} | ${cell(f.productCode)} | ${day(f.dueAt)} |`,
			),
			"",
		);
	}
	lines.push(
		"## Anhang: Scans",
		"",
		"| Datum | Werkzeug | Ziel | Ergebnis |",
		"|---|---|---|---|",
		...input.scans
			.slice(0, 50)
			.map(
				(s) =>
					`| ${day(s.startedAt)} | ${cell(s.toolName ?? s.tool)} | ${cell(s.target)} | ${s.counts ? `${s.counts.critical} krit., ${s.counts.high} hoch, ${s.counts.new} neu, ${s.counts.resolved} behoben` : s.status} |`,
			),
		"",
		"## Methode",
		"",
		"Befunde aus importierten Scan-Ergebnissen (SARIF, Trivy, OWASP ZAP, OSV-Scanner, Nuclei, gitleaks — von der Organisation in der eigenen CI gegen eigene Systeme ausgeführt) und dem passiven Klick-Schnellcheck (nur öffentlich ausgelieferte Inhalte: Header, Cookies, TLS, DNS, security.txt, JavaScript-Bundles, Source-Maps; keine Angriffe, keine Pfad-Proben). Schwere nach CVSS-Bändern bzw. Tool-Stufe; Fristen: kritisch 7, hoch 30, mittel 90, niedrig 180 Tage. Secrets sind redigiert.",
		"",
		"_Automatisierte Prüfung — ersetzt keinen Penetrationstest und kein Testat._",
		"",
	);
	return lines.join("\n");
}
