import { describe, expect, it } from "vitest";
import {
	fingerprint,
	gateFails,
	reconcile,
	redactIn,
	redactSecret,
	severityFromCvss,
	severityFromLabel,
	slaDueAt,
} from "@/lib/security/finding-rules";
import { parseScanFile } from "@/lib/security/parsers";

// Secret-förmige Testdaten zur Laufzeit zusammensetzen (gitleaks im CI).
const FAKE_SECRET = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

const ok = (text: string, name = "") => {
	const r = parseScanFile(text, name);
	if (!r.ok) throw new Error(r.error);
	return r.scan;
};

describe("parseScanFile", () => {
	it("SARIF (Opengrep): Regel, Schwere aus security-severity, CWE, Fundstelle", () => {
		const scan = ok(
			JSON.stringify({
				version: "2.1.0",
				runs: [
					{
						tool: {
							driver: {
								name: "Opengrep",
								version: "1.2.0",
								rules: [
									{
										id: "js.xss",
										shortDescription: { text: "Reflektiertes XSS" },
										properties: {
											"security-severity": "8.1",
											tags: ["external/cwe/cwe-79"],
										},
									},
								],
							},
						},
						results: [
							{
								ruleId: "js.xss",
								level: "warning",
								message: { text: "Nutzereingabe ungefiltert" },
								locations: [
									{
										physicalLocation: {
											artifactLocation: { uri: "src/app.ts" },
											region: { startLine: 42 },
										},
									},
								],
								partialFingerprints: { primaryLocationLineHash: "abc:1" },
							},
						],
					},
				],
			}),
		);
		expect(scan.tool).toBe("sarif");
		expect(scan.toolName).toBe("Opengrep 1.2.0");
		expect(scan.findings).toHaveLength(1);
		expect(scan.findings[0]).toMatchObject({
			ruleId: "js.xss",
			title: "Reflektiertes XSS",
			severity: "high",
			category: "code",
			location: "src/app.ts:42",
			cwe: "CWE-79",
			toolFingerprint: "abc:1",
		});
	});

	it("gitleaks SARIF: Snippet mit Secret wird nie übernommen", () => {
		const text = JSON.stringify({
			version: "2.1.0",
			runs: [
				{
					tool: {
						driver: {
							name: "gitleaks",
							rules: [{ id: "stripe-access-token" }],
						},
					},
					results: [
						{
							ruleId: "stripe-access-token",
							message: { text: "stripe-access-token has detected secret" },
							locations: [
								{
									physicalLocation: {
										artifactLocation: { uri: ".env" },
										region: { startLine: 3, snippet: { text: FAKE_SECRET } },
									},
								},
							],
						},
					],
				},
			],
		});
		const scan = ok(text);
		expect(scan.tool).toBe("gitleaks");
		expect(scan.findings[0]?.category).toBe("secret");
		expect(JSON.stringify(scan)).not.toContain(FAKE_SECRET);
	});

	it("gitleaks JSON: redigiert, Autor/E-Mail verworfen", () => {
		const scan = ok(
			JSON.stringify([
				{
					Description: "Stripe Access Token",
					StartLine: 7,
					File: "config/pay.ts",
					Secret: FAKE_SECRET,
					Match: `const key = "${FAKE_SECRET}"`,
					RuleID: "stripe-access-token",
					Fingerprint: "c0ffee:config/pay.ts:stripe-access-token:7",
					Author: "Ada",
					Email: "ada@example.com",
				},
			]),
		);
		const f = scan.findings[0];
		expect(f).toMatchObject({
			category: "secret",
			severity: "high",
			location: "config/pay.ts:7",
		});
		expect(f?.evidence).toContain("sk_l…(32 Zeichen)");
		const all = JSON.stringify(scan);
		expect(all).not.toContain(FAKE_SECRET);
		expect(all).not.toContain("ada@example.com");
	});

	it("Trivy: Schwachstellen, Fehlkonfiguration, Secrets ohne Inhalt", () => {
		const scan = ok(
			JSON.stringify({
				SchemaVersion: 2,
				ArtifactName: "ghcr.io/acme/app:1.4",
				Results: [
					{
						Target: "package-lock.json",
						Vulnerabilities: [
							{
								VulnerabilityID: "CVE-2024-4068",
								PkgName: "braces",
								InstalledVersion: "3.0.2",
								FixedVersion: "3.0.3",
								Severity: "HIGH",
								Title: "braces: ReDoS",
								CweIDs: ["CWE-1050"],
								CVSS: { nvd: { V3Score: 7.5 } },
							},
						],
						Misconfigurations: [
							{
								ID: "DS002",
								Title: "Root-User",
								Severity: "HIGH",
								Status: "FAIL",
							},
							{ ID: "DS001", Title: "ok", Severity: "LOW", Status: "PASS" },
						],
						Secrets: [
							{ RuleID: "aws", Title: "AWS", StartLine: 2, Match: "****" },
						],
					},
				],
			}),
		);
		expect(scan.target).toBe("ghcr.io/acme/app:1.4");
		expect(scan.findings.map((f) => f.category)).toEqual([
			"dependency",
			"config",
			"secret",
		]);
		expect(scan.findings[0]).toMatchObject({
			cve: "CVE-2024-4068",
			cvss: 7.5,
			package: { name: "braces", version: "3.0.2", fixed: "3.0.3" },
		});
	});

	it("ZAP: Risiko-Code, HTML entfernt, Header als web", () => {
		const scan = ok(
			JSON.stringify({
				"@programName": "ZAP",
				"@version": "2.15.0",
				site: [
					{
						"@name": "https://staging.example.com",
						alerts: [
							{
								pluginid: "10038",
								alertRef: "10038-1",
								name: "Content Security Policy (CSP) Header Not Set",
								riskcode: "2",
								desc: "<p>CSP fehlt.</p>",
								solution: "<p>CSP setzen.</p>",
								cweid: "693",
								instances: [
									{ uri: "https://staging.example.com/" },
									{ uri: "https://staging.example.com/a" },
								],
							},
						],
					},
				],
			}),
		);
		expect(scan.findings[0]).toMatchObject({
			ruleId: "zap-10038-1",
			severity: "medium",
			category: "web",
			cwe: "CWE-693",
			description: "CSP fehlt. 2 Fundstellen.",
			remediation: "CSP setzen.",
		});
	});

	it("OSV-Scanner: Schwere aus Gruppe, CVE aus Aliases, Fix-Version", () => {
		const scan = ok(
			JSON.stringify({
				results: [
					{
						source: { path: "/repo/package-lock.json", type: "lockfile" },
						packages: [
							{
								package: { name: "braces", version: "3.0.2", ecosystem: "npm" },
								vulnerabilities: [
									{
										id: "GHSA-grv7-fg5c-xmjg",
										aliases: ["CVE-2024-4068"],
										summary: "ReDoS in braces",
										affected: [
											{
												ranges: [
													{ events: [{ introduced: "0" }, { fixed: "3.0.3" }] },
												],
											},
										],
									},
								],
								groups: [{ ids: ["GHSA-grv7-fg5c-xmjg"], max_severity: "7.5" }],
							},
						],
					},
				],
			}),
		);
		const f = scan.findings[0];
		expect(f).toMatchObject({ severity: "high", cve: "CVE-2024-4068" });
		expect(f?.package?.fixed).toBe("3.0.3");
	});

	it("Nuclei JSONL", () => {
		const line = (id: string, sev: string) =>
			JSON.stringify({
				"template-id": id,
				info: { name: id, severity: sev, tags: ["exposure"] },
				host: "https://staging.example.com",
				"matched-at": `https://staging.example.com/${id}`,
			});
		const scan = ok(
			`${line("git-config", "medium")}\n${line("x", "info")}\n`,
			"out.jsonl",
		);
		expect(scan.tool).toBe("nuclei");
		expect(scan.findings.map((f) => f.severity)).toEqual(["medium", "info"]);
		expect(scan.findings[0]?.category).toBe("exposure");
	});

	it("Fehler: kein JSON, unbekanntes Format", () => {
		expect(parseScanFile("{nope")).toEqual({
			ok: false,
			error: "invalid_json",
		});
		expect(parseScanFile(JSON.stringify({ a: 1 }))).toEqual({
			ok: false,
			error: "unknown_format",
		});
	});
});

describe("Befund-Regeln", () => {
	it("Schwere aus CVSS und Tool-Stufen", () => {
		expect(severityFromCvss(9.8)).toBe("critical");
		expect(severityFromCvss(7)).toBe("high");
		expect(severityFromCvss(4)).toBe("medium");
		expect(severityFromCvss(0.1)).toBe("low");
		expect(severityFromCvss(null)).toBeNull();
		expect(severityFromLabel("CRITICAL")).toBe("critical");
		expect(severityFromLabel("error")).toBe("high");
		expect(severityFromLabel("warning")).toBe("medium");
		expect(severityFromLabel("UNKNOWN")).toBe("info");
	});

	it("Fingerprint: Abhängigkeit unabhängig von Tool und Version", () => {
		const base = {
			ruleId: "CVE-2024-4068",
			title: "x",
			severity: "high" as const,
			category: "dependency" as const,
			location: "package-lock.json",
			cwe: null,
			cve: "CVE-2024-4068",
			cvss: null,
			description: null,
			remediation: null,
			evidence: null,
			toolFingerprint: null,
		};
		const a = fingerprint(
			{ ...base, package: { name: "braces", version: "3.0.2", fixed: null } },
			"repo",
		);
		const b = fingerprint(
			{
				...base,
				ruleId: "GHSA-x",
				location: "/other/path",
				package: { name: "braces", version: "3.0.1", fixed: "3.0.3" },
			},
			"repo",
		);
		expect(a).toBe(b);
		expect(a).toHaveLength(40);
		expect(
			fingerprint(
				{ ...base, package: { name: "braces", version: null, fixed: null } },
				"other",
			),
		).not.toBe(a);
	});

	it("Redaktion: Präfix und Länge, nie der Wert", () => {
		expect(redactSecret(FAKE_SECRET)).toBe("sk_l…(32 Zeichen)");
		expect(redactSecret("short")).toBe("…(5 Zeichen)");
		expect(redactIn(`k=${FAKE_SECRET};`, FAKE_SECRET)).toBe(
			"k=sk_l…(32 Zeichen);",
		);
	});

	it("SLA je Schwere", () => {
		const t = new Date("2026-10-01T00:00:00Z");
		expect(slaDueAt("critical", t)?.toISOString().slice(0, 10)).toBe(
			"2026-10-08",
		);
		expect(slaDueAt("high", t)?.toISOString().slice(0, 10)).toBe("2026-10-31");
		expect(slaDueAt("info", t)).toBeNull();
	});

	it("Abgleich: neu, gesehen, Regression, Vollscan löst Fehlendes", () => {
		const existing = [
			{ id: "1", fingerprint: "a", status: "open" as const },
			{ id: "2", fingerprint: "b", status: "resolved" as const },
			{ id: "3", fingerprint: "c", status: "accepted" as const },
			{ id: "4", fingerprint: "d", status: "in_progress" as const },
			{ id: "5", fingerprint: "e", status: "false_positive" as const },
		];
		expect(reconcile(existing, ["a", "b", "c", "x"], false)).toEqual({
			create: ["x"],
			seen: ["1", "3"],
			reopen: ["2"],
			resolve: [],
		});
		expect(reconcile(existing, ["a"], true).resolve).toEqual(["4"]);
	});

	it("CI-Gate ab Schwelle", () => {
		expect(gateFails(["medium", "low"], "high")).toBe(false);
		expect(gateFails(["medium", "critical"], "high")).toBe(true);
		expect(gateFails(["critical"], null)).toBe(false);
	});
});
