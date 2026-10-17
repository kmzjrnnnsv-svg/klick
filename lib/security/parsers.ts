import type { FindingCategory, ScanTool } from "@/db/schema/enums";
import {
	redactIn,
	redactSecret,
	severityFromCvss,
	severityFromLabel,
} from "./finding-rules";
import { emptyFinding, type NormalizedFinding, type ParsedScan } from "./types";

// Scan-Importe: SARIF 2.1 (Opengrep, CodeQL-Export, gitleaks --report-format
// sarif, Trivy sarif), Trivy JSON, OWASP ZAP JSON, OSV-Scanner JSON, Nuclei
// JSONL, gitleaks JSON. Rein — kein Netz, keine DB. Secrets werden hier
// redigiert; Autor/E-Mail aus gitleaks-Commits werden verworfen (PII).

export type ScanParseError = "invalid_json" | "unknown_format" | "too_many";

const MAX_FINDINGS = 20_000;
const TEXT_MAX = 4000;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
	typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const num = (v: unknown): number | null => {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
};
const clip = (v: string | null, max = TEXT_MAX) =>
	v && v.length > max ? `${v.slice(0, max)}…` : v;
// ZAP liefert HTML in Beschreibungen
const stripHtml = (v: string | null) =>
	v
		? v
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
		: null;
const cveOf = (...vals: unknown[]): string | null => {
	for (const v of vals.flatMap((x) => (Array.isArray(x) ? x : [x])))
		if (typeof v === "string" && /^CVE-\d{4}-\d+$/i.test(v))
			return v.toUpperCase();
	return null;
};
const cweOf = (...vals: unknown[]): string | null => {
	for (const v of vals.flatMap((x) => (Array.isArray(x) ? x : [x]))) {
		const m = /cwe[-/]?(\d+)/i.exec(String(v ?? ""));
		if (m) return `CWE-${m[1]}`;
		if (typeof v === "number" && v > 0) return `CWE-${v}`;
		if (typeof v === "string" && /^\d+$/.test(v) && v !== "0")
			return `CWE-${v}`;
	}
	return null;
};

// ── SARIF ─────────────────────────────────────────────────────────────────

function parseSarif(doc: Obj): ParsedScan {
	const findings: NormalizedFinding[] = [];
	let toolName: string | null = null;
	for (const run of arr(doc.runs)) {
		if (!isObj(run)) continue;
		const driver =
			isObj(run.tool) && isObj(run.tool.driver) ? run.tool.driver : {};
		const name = str(driver.name) ?? "SARIF";
		toolName ??= [name, str(driver.version) ?? str(driver.semanticVersion)]
			.filter(Boolean)
			.join(" ");
		const isSecretTool = /gitleaks|trufflehog|secret/i.test(name);
		const rules = arr(driver.rules).filter(isObj);
		const ruleById = new Map(rules.map((r) => [str(r.id) ?? "", r]));
		for (const res of arr(run.results)) {
			if (!isObj(res)) continue;
			if (findings.length >= MAX_FINDINGS) break;
			const ruleId =
				str(res.ruleId) ??
				(typeof res.ruleIndex === "number"
					? str(rules[res.ruleIndex]?.id)
					: null) ??
				"rule";
			const rule = ruleById.get(ruleId) ?? {};
			const props = isObj(rule.properties) ? rule.properties : {};
			const tags = arr(props.tags).map(String);
			const secScore = num(props["security-severity"]);
			const level =
				str(res.level) ??
				(isObj(rule.defaultConfiguration)
					? str(rule.defaultConfiguration.level)
					: null);
			const loc = arr(res.locations).find(isObj);
			const phys =
				loc && isObj(loc.physicalLocation) ? loc.physicalLocation : {};
			const uri = isObj(phys.artifactLocation)
				? str(phys.artifactLocation.uri)
				: null;
			const line = isObj(phys.region) ? num(phys.region.startLine) : null;
			const secret =
				isSecretTool || tags.some((t) => /secret/i.test(t)) ? "secret" : null;
			const isCve = /^CVE-/i.test(ruleId);
			const category: FindingCategory = secret
				? "secret"
				: isCve
					? "dependency"
					: "code";
			const message = isObj(res.message) ? str(res.message.text) : null;
			const pfp = isObj(res.partialFingerprints)
				? (Object.values(res.partialFingerprints).find(
						(v) => typeof v === "string",
					) as string | undefined)
				: undefined;
			// Snippets (gitleaks legt das Secret hier ab) nie übernehmen.
			findings.push(
				emptyFinding({
					ruleId,
					title:
						str(
							isObj(rule.shortDescription) ? rule.shortDescription.text : null,
						) ??
						clip(message, 200) ??
						ruleId,
					severity:
						category === "secret"
							? "high"
							: (severityFromCvss(secScore) ?? severityFromLabel(level)),
					category,
					location: uri ? `${uri}${line ? `:${line}` : ""}` : null,
					cwe: cweOf(tags),
					cve: isCve ? ruleId.toUpperCase() : null,
					cvss: secScore,
					description: clip(
						category === "secret"
							? "Secret im Code gefunden (Wert redigiert)."
							: (str(
									isObj(rule.fullDescription)
										? rule.fullDescription.text
										: null,
								) ?? message),
					),
					remediation: clip(str(isObj(rule.help) ? rule.help.text : null)),
					toolFingerprint: pfp ?? null,
				}),
			);
		}
	}
	return {
		tool: findings.some((f) => f.category === "secret") ? "gitleaks" : "sarif",
		toolName,
		target: null,
		findings,
	};
}

// ── Trivy JSON ─────────────────────────────────────────────────────────────

function parseTrivy(doc: Obj): ParsedScan {
	const findings: NormalizedFinding[] = [];
	for (const r of arr(doc.Results)) {
		if (!isObj(r)) continue;
		const target = str(r.Target);
		for (const v of arr(r.Vulnerabilities)) {
			if (!isObj(v) || findings.length >= MAX_FINDINGS) continue;
			const cvss = isObj(v.CVSS)
				? Math.max(
						...Object.values(v.CVSS)
							.filter(isObj)
							.map((x) => num(x.V3Score) ?? num(x.V40Score) ?? 0),
						0,
					)
				: null;
			const id = str(v.VulnerabilityID) ?? "vuln";
			findings.push(
				emptyFinding({
					ruleId: id,
					title: str(v.Title) ?? `${id} in ${str(v.PkgName) ?? "Paket"}`,
					severity: severityFromLabel(str(v.Severity)),
					category: "dependency",
					location: target,
					cve: cveOf(id),
					cwe: cweOf(v.CweIDs),
					cvss: cvss || null,
					description: clip(str(v.Description)),
					remediation: str(v.FixedVersion)
						? `Auf ${str(v.PkgName)} ${str(v.FixedVersion)} aktualisieren.`
						: null,
					package: {
						name: str(v.PkgName) ?? "?",
						version: str(v.InstalledVersion),
						fixed: str(v.FixedVersion),
					},
				}),
			);
		}
		for (const m of arr(r.Misconfigurations)) {
			if (!isObj(m) || str(m.Status) === "PASS") continue;
			findings.push(
				emptyFinding({
					ruleId: str(m.ID) ?? str(m.AVDID) ?? "misconfig",
					title: str(m.Title) ?? "Fehlkonfiguration",
					severity: severityFromLabel(str(m.Severity)),
					category: "config",
					location: target,
					description: clip(str(m.Description)),
					remediation: clip(str(m.Resolution)),
				}),
			);
		}
		for (const s of arr(r.Secrets)) {
			if (!isObj(s)) continue;
			const line = num(s.StartLine);
			findings.push(
				emptyFinding({
					ruleId: str(s.RuleID) ?? "secret",
					title: str(s.Title) ?? "Secret im Code",
					severity: "high",
					category: "secret",
					location: target ? `${target}${line ? `:${line}` : ""}` : null,
					description: "Secret im Code gefunden (Wert redigiert).",
					// Trivy maskiert Match bereits mit *** — trotzdem nicht übernehmen
					evidence: null,
				}),
			);
		}
	}
	return {
		tool: "trivy",
		toolName: `Trivy${str(doc.SchemaVersion) ? ` (Schema ${doc.SchemaVersion})` : ""}`,
		target: str(doc.ArtifactName),
		findings,
	};
}

// ── OWASP ZAP JSON ─────────────────────────────────────────────────────────

const ZAP_RISK: Record<string, NormalizedFinding["severity"]> = {
	"3": "high",
	"2": "medium",
	"1": "low",
	"0": "info",
};

function parseZap(doc: Obj): ParsedScan {
	const findings: NormalizedFinding[] = [];
	let target: string | null = null;
	for (const site of arr(doc.site)) {
		if (!isObj(site)) continue;
		target ??= str(site["@name"]);
		for (const a of arr(site.alerts)) {
			if (!isObj(a) || findings.length >= MAX_FINDINGS) continue;
			const name = str(a.name) ?? str(a.alert) ?? "Alert";
			const inst = arr(a.instances).filter(isObj);
			const uri = str(inst[0]?.uri) ?? str(site["@name"]);
			findings.push(
				emptyFinding({
					ruleId: `zap-${str(a.alertRef) ?? str(a.pluginid) ?? name}`,
					title: name,
					severity: ZAP_RISK[String(a.riskcode)] ?? "info",
					category: /header|csp|hsts|x-frame|content-type/i.test(name)
						? "web"
						: /cookie|tls|ssl/i.test(name)
							? "config"
							: "web",
					location: uri,
					cwe: cweOf(a.cweid),
					description: clip(
						[
							stripHtml(str(a.desc)),
							inst.length > 1 ? `${inst.length} Fundstellen.` : null,
						]
							.filter(Boolean)
							.join(" "),
					),
					remediation: clip(stripHtml(str(a.solution))),
				}),
			);
		}
	}
	return {
		tool: "zap",
		toolName: ["OWASP ZAP", str(doc["@version"])].filter(Boolean).join(" "),
		target,
		findings,
	};
}

// ── OSV-Scanner JSON ───────────────────────────────────────────────────────

function parseOsv(doc: Obj): ParsedScan {
	const findings: NormalizedFinding[] = [];
	let target: string | null = null;
	for (const r of arr(doc.results)) {
		if (!isObj(r)) continue;
		const src = isObj(r.source) ? str(r.source.path) : null;
		target ??= src;
		for (const p of arr(r.packages)) {
			if (!isObj(p)) continue;
			const pkg = isObj(p.package) ? p.package : {};
			const groups = arr(p.groups).filter(isObj);
			for (const v of arr(p.vulnerabilities)) {
				if (!isObj(v) || findings.length >= MAX_FINDINGS) continue;
				const id = str(v.id) ?? "osv";
				const group = groups.find((g) => arr(g.ids).includes(id));
				const score = num(group?.max_severity);
				const dbSev = isObj(v.database_specific)
					? str(v.database_specific.severity)
					: null;
				const fixed = arr(v.affected)
					.filter(isObj)
					.flatMap((a) => arr(a.ranges).filter(isObj))
					.flatMap((rg) => arr(rg.events).filter(isObj))
					.map((e) => str(e.fixed))
					.find(Boolean);
				findings.push(
					emptyFinding({
						ruleId: id,
						title: str(v.summary) ?? `${id} in ${str(pkg.name) ?? "Paket"}`,
						severity: severityFromCvss(score) ?? severityFromLabel(dbSev),
						category: "dependency",
						location: src,
						cve: cveOf(id, v.aliases),
						cvss: score,
						description: clip(str(v.details)),
						remediation: fixed
							? `Auf ${str(pkg.name)} ${fixed} aktualisieren.`
							: null,
						package: {
							name: str(pkg.name) ?? "?",
							version: str(pkg.version),
							fixed: fixed ?? null,
						},
					}),
				);
			}
		}
	}
	return { tool: "osv", toolName: "OSV-Scanner", target, findings };
}

// ── Nuclei JSONL ───────────────────────────────────────────────────────────

function parseNuclei(lines: Obj[]): ParsedScan {
	const findings: NormalizedFinding[] = [];
	let target: string | null = null;
	for (const l of lines) {
		if (findings.length >= MAX_FINDINGS) break;
		const info = isObj(l.info) ? l.info : {};
		const cls = isObj(info.classification) ? info.classification : {};
		target ??= str(l.host);
		const id = str(l["template-id"]) ?? "nuclei";
		findings.push(
			emptyFinding({
				ruleId: id,
				title: str(info.name) ?? id,
				severity: severityFromLabel(str(info.severity)),
				category: /exposure|exposed|disclosure|config/i.test(
					`${id} ${arr(info.tags).join(" ")}`,
				)
					? "exposure"
					: "web",
				location: str(l["matched-at"]) ?? str(l.host),
				cve: cveOf(cls["cve-id"]),
				cwe: cweOf(cls["cwe-id"]),
				cvss: num(cls["cvss-score"]),
				description: clip(str(info.description)),
				remediation: clip(str(info.remediation)),
			}),
		);
	}
	return { tool: "nuclei", toolName: "Nuclei", target, findings };
}

// ── gitleaks JSON ──────────────────────────────────────────────────────────

function parseGitleaks(items: Obj[]): ParsedScan {
	const findings: NormalizedFinding[] = items
		.slice(0, MAX_FINDINGS)
		.map((g) => {
			const secret = str(g.Secret);
			const file = str(g.File);
			const line = num(g.StartLine);
			return emptyFinding({
				ruleId: str(g.RuleID) ?? "secret",
				title: str(g.Description) ?? "Secret im Code",
				severity: "high",
				category: "secret",
				location: file ? `${file}${line ? `:${line}` : ""}` : null,
				description: "Secret im Code gefunden (Wert redigiert).",
				remediation:
					"Secret sofort widerrufen und neu ausstellen, aus der Git-Historie entfernen, Zugriffe im Zeitraum prüfen.",
				evidence: redactIn(str(g.Match), secret) ?? redactSecret(secret),
				toolFingerprint: str(g.Fingerprint),
			});
		});
	return { tool: "gitleaks", toolName: "gitleaks", target: null, findings };
}

// ── Erkennung ──────────────────────────────────────────────────────────────

export function parseScanFile(
	text: string,
	fileName = "",
): { ok: true; scan: ParsedScan } | { ok: false; error: ScanParseError } {
	const trimmed = text.trim();
	if (trimmed === "") return { ok: false, error: "invalid_json" };
	// JSONL (Nuclei): mehrere JSON-Objekte zeilenweise
	if (fileName.endsWith(".jsonl") || /^\{[^\n]*\}\s*\n\s*\{/.test(trimmed)) {
		const lines: Obj[] = [];
		for (const raw of trimmed.split(/\r?\n/)) {
			if (!raw.trim()) continue;
			try {
				const o = JSON.parse(raw);
				if (isObj(o)) lines.push(o);
			} catch {
				return { ok: false, error: "invalid_json" };
			}
		}
		if (lines.some((l) => "template-id" in l))
			return { ok: true, scan: parseNuclei(lines) };
		return { ok: false, error: "unknown_format" };
	}
	let doc: unknown;
	try {
		doc = JSON.parse(trimmed);
	} catch {
		return { ok: false, error: "invalid_json" };
	}
	if (Array.isArray(doc)) {
		const items = doc.filter(isObj);
		if (items.length === 0) return { ok: true, scan: parseGitleaks([]) };
		if (items.some((i) => "RuleID" in i && ("Secret" in i || "Match" in i)))
			return { ok: true, scan: parseGitleaks(items) };
		if (items.some((i) => "template-id" in i))
			return { ok: true, scan: parseNuclei(items) };
		return { ok: false, error: "unknown_format" };
	}
	if (!isObj(doc)) return { ok: false, error: "unknown_format" };
	if (
		Array.isArray(doc.runs) &&
		(str(doc.version)?.startsWith("2.") || "$schema" in doc)
	)
		return { ok: true, scan: parseSarif(doc) };
	if ("SchemaVersion" in doc && "Results" in doc)
		return { ok: true, scan: parseTrivy(doc) };
	if (Array.isArray(doc.site) || "@programName" in doc)
		return { ok: true, scan: parseZap(doc) };
	if (
		Array.isArray(doc.results) &&
		arr(doc.results).some((r) => isObj(r) && "packages" in r)
	)
		return { ok: true, scan: parseOsv(doc) };
	return { ok: false, error: "unknown_format" };
}

export const SCAN_TOOL_LABEL: Record<ScanTool, string> = {
	sarif: "SARIF",
	trivy: "Trivy",
	zap: "OWASP ZAP",
	osv: "OSV-Scanner",
	nuclei: "Nuclei",
	gitleaks: "gitleaks",
	quick_check: "Schnellcheck",
	manual: "Manuell",
};
