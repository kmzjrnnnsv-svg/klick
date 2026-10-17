import type {
	EngagementKind,
	EngagementStatus,
	FindingSeverity,
	FindingStatus,
	RetestStatus,
} from "@/db/schema/enums";
import { toCsv } from "@/lib/csv";
import type { ZipEntry } from "./zip";

// Bericht eines Sicherheitsauftrags (Pentest u. a.) als Dateien für das
// ZIP: Management-Summary, Umfang und Regeln, Befunde, Nachtest, CSV. Rein;
// die Route lädt die Daten (Befund-Details entschlüsselt) und hängt
// Manifest und Export-Kennzeichnung an.

export type ReportFinding = {
	id: string;
	title: string;
	severity: FindingSeverity;
	status: FindingStatus;
	cvss: number | null;
	cvssVector: string | null;
	cwe: string | null;
	cve: string | null;
	target: string | null;
	location: string | null;
	description: string | null;
	steps: string | null;
	remediation: string | null;
	retestStatus: RetestStatus | null;
	retestedAt: Date | null;
	retestNote: string | null;
};

export type ReportInput = {
	orgName: string;
	exportLine: string;
	engagement: {
		code: string;
		kind: EngagementKind;
		title: string;
		status: EngagementStatus;
		scope: string | null;
		targets: readonly string[];
		outOfScope: string | null;
		rulesOfEngagement: string | null;
		methodology: string | null;
		testerExternal: boolean;
		testerName: string | null;
		testerOrg: string | null;
		startAt: string | null;
		endAt: string | null;
		summary: string | null;
		result: "pass" | "partial" | "fail" | null;
		deliveredAt: Date | null;
		retestDueAt: string | null;
		authorizedAt: Date | null;
	};
	productLabel: string | null;
	authorization: { fileName: string | null; sha256: string | null } | null;
	authorizedBy: string | null;
	findings: readonly ReportFinding[];
	// nur CRA-Readiness: eingebetteter Prüfungsreife-Bericht
	readinessMarkdown?: string | null;
};

export const KIND_LABEL: Record<EngagementKind, string> = {
	pentest: "Penetrationstest",
	security_check: "Security-Check",
	quick_check: "Schnellcheck",
	cra_readiness: "CRA-Readiness",
};
const SEVERITY: Record<FindingSeverity, string> = {
	critical: "kritisch",
	high: "hoch",
	medium: "mittel",
	low: "niedrig",
	info: "Hinweis",
};
const STATUS: Record<FindingStatus, string> = {
	open: "offen",
	in_progress: "in Arbeit",
	accepted: "akzeptiert",
	resolved: "behoben",
	false_positive: "kein Befund",
};
const RETEST: Record<RetestStatus, string> = {
	pending: "ausstehend",
	passed: "bestanden",
	failed: "nicht bestanden",
};
const RESULT = {
	pass: "wirksam",
	partial: "teilweise wirksam",
	fail: "nicht wirksam",
} as const;
const ORDER: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];

const fmtDate = (d: Date | string | null) =>
	d
		? new Intl.DateTimeFormat("de-DE", {
				dateStyle: "medium",
				timeZone: "Europe/Berlin",
			}).format(typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d)
		: "—";
const cell = (v: unknown) =>
	v === null || v === undefined || v === ""
		? "—"
		: String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
const block = (v: string | null) => (v?.trim() ? v.trim() : "—");
export const findingRef = (i: number) => `F-${String(i + 1).padStart(2, "0")}`;

function header(input: ReportInput, title: string): string[] {
	const e = input.engagement;
	return [
		`# ${title}`,
		"",
		input.exportLine,
		"",
		`**${input.orgName}** · ${KIND_LABEL[e.kind]} ${e.code} · ${e.title}`,
		"",
	];
}

export function buildEngagementReport(input: ReportInput): ZipEntry[] {
	const e = input.engagement;
	const open = input.findings.filter(
		(f) => f.status === "open" || f.status === "in_progress",
	);
	const tester = [e.testerName, e.testerOrg].filter(Boolean).join(", ");

	const summary = [
		...header(input, "Management-Summary"),
		"| | |",
		"|---|---|",
		`| Art | ${KIND_LABEL[e.kind]}${e.testerExternal ? " (extern)" : " (intern)"} |`,
		`| Gegenstand | ${cell(input.productLabel ?? e.targets.join(", "))} |`,
		`| Zeitraum | ${fmtDate(e.startAt)} – ${fmtDate(e.endAt)} |`,
		`| Durchführung | ${cell(tester)} |`,
		`| Bericht geliefert | ${fmtDate(e.deliveredAt)} |`,
		`| Ergebnis | ${e.result ? RESULT[e.result] : "—"} |`,
		`| Nachtest fällig | ${fmtDate(e.retestDueAt)} |`,
		"",
		"## Zusammenfassung",
		"",
		block(e.summary),
		"",
		"## Befunde nach Schwere",
		"",
		"| Schwere | gesamt | offen |",
		"|---|---:|---:|",
		...ORDER.map(
			(s) =>
				`| ${SEVERITY[s]} | ${input.findings.filter((f) => f.severity === s).length} | ${open.filter((f) => f.severity === s).length} |`,
		),
		"",
	];
	const top = input.findings
		.map((f, i) => ({ f, ref: findingRef(i) }))
		.filter(
			({ f }) =>
				(f.severity === "critical" || f.severity === "high") &&
				(f.status === "open" || f.status === "in_progress"),
		)
		.slice(0, 5);
	if (top.length > 0)
		summary.push(
			"## Dringend",
			"",
			...top.map(
				({ f, ref }) =>
					`- **${ref} ${f.title}** (${SEVERITY[f.severity]}${f.cvss !== null ? `, CVSS ${f.cvss.toFixed(1)}` : ""}) — ${cell(f.remediation)}`,
			),
			"",
		);
	summary.push(
		"## Einordnung",
		"",
		"Das Ergebnis beschreibt den Stand der geprüften Ziele im Prüfzeitraum mit der angegebenen Methodik. Es ist kein Nachweis, dass keine weiteren Schwachstellen bestehen, und kein Testat.",
		"",
	);

	const scope = [
		...header(input, "Umfang, Regeln und Beauftragung"),
		"## Umfang",
		"",
		block(e.scope),
		"",
		"## Ziele",
		"",
		...(e.targets.length > 0 ? e.targets.map((t) => `- ${t}`) : ["—"]),
		"",
		"## Nicht im Umfang",
		"",
		block(e.outOfScope),
		"",
		"## Regeln (Rules of Engagement)",
		"",
		block(e.rulesOfEngagement),
		"",
		"## Methodik",
		"",
		block(e.methodology),
		"",
		"## Beauftragung",
		"",
		input.authorization
			? `Schriftliche Beauftragung „${input.authorization.fileName ?? "—"}“ (SHA-256 ${input.authorization.sha256 ?? "—"}), bestätigt ${fmtDate(e.authorizedAt)}${input.authorizedBy ? ` durch ${input.authorizedBy}` : ""}.`
			: "Keine schriftliche Beauftragung hinterlegt.",
		"",
	];

	const findings = [
		...header(input, "Befunde"),
		...(input.findings.length === 0 ? ["Keine Befunde.", ""] : []),
		...input.findings.flatMap((f, i) => [
			`## ${findingRef(i)} ${f.title}`,
			"",
			"| | |",
			"|---|---|",
			`| Schwere | ${SEVERITY[f.severity]} |`,
			`| CVSS | ${f.cvss !== null ? f.cvss.toFixed(1) : "—"}${f.cvssVector ? ` (\`${f.cvssVector}\`)` : ""} |`,
			`| CWE/CVE | ${cell([f.cwe, f.cve].filter(Boolean).join(", "))} |`,
			`| Ziel/Fundstelle | ${cell([f.target, f.location].filter(Boolean).join(" · "))} |`,
			`| Status | ${STATUS[f.status]}${f.retestStatus ? ` · Nachtest ${RETEST[f.retestStatus]}` : ""} |`,
			"",
			"**Beschreibung**",
			"",
			block(f.description),
			"",
			"**Reproduktion**",
			"",
			block(f.steps),
			"",
			"**Empfehlung**",
			"",
			block(f.remediation),
			"",
		]),
	];

	const retest = [
		...header(input, "Nachtest"),
		`Nachtest fällig: ${fmtDate(e.retestDueAt)}`,
		"",
		"| Befund | Schwere | Status | Nachtest | am | Notiz |",
		"|---|---|---|---|---|---|",
		...input.findings.map(
			(f, i) =>
				`| ${findingRef(i)} ${cell(f.title)} | ${SEVERITY[f.severity]} | ${STATUS[f.status]} | ${f.retestStatus ? RETEST[f.retestStatus] : "—"} | ${fmtDate(f.retestedAt)} | ${cell(f.retestNote)} |`,
		),
		"",
	];

	const csv = toCsv(
		[
			"ref",
			"titel",
			"schwere",
			"cvss",
			"cvss_vektor",
			"cwe",
			"cve",
			"ziel",
			"fundstelle",
			"status",
			"nachtest",
		],
		input.findings.map((f, i) => [
			findingRef(i),
			f.title,
			SEVERITY[f.severity],
			f.cvss,
			f.cvssVector,
			f.cwe,
			f.cve,
			f.target,
			f.location,
			STATUS[f.status],
			f.retestStatus ? RETEST[f.retestStatus] : "",
		]),
	);

	const entries: ZipEntry[] = [
		{ name: "00_Management-Summary.md", data: summary.join("\n") },
		{ name: "01_Umfang-und-Regeln.md", data: scope.join("\n") },
		{ name: "02_Befunde.md", data: findings.join("\n") },
		{ name: "03_Nachtest.md", data: retest.join("\n") },
		{ name: "befunde.csv", data: csv },
	];
	if (input.readinessMarkdown)
		entries.push({
			name: "04_CRA-Pruefungsreife.md",
			data: input.readinessMarkdown,
		});
	return entries;
}
