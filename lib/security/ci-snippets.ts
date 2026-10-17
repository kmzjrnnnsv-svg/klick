// GitHub-Actions-Vorlage für den Ingest (ADR-017): Scanner laufen in der
// eigenen CI des Kunden gegen das eigene Repository bzw. Staging, Klick nimmt
// nur Ergebnisse an. Actions sind per Commit-SHA gepinnt (Lieferkette; SHAs
// am 17.10.2026 per git ls-remote gegen die Tags geprüft) — beim Übernehmen
// auf neuere Releases aktualisieren.

export type CiSnippetInput = {
	baseUrl: string;
	productCode?: string | null;
	failOn?: "critical" | "high" | null;
	stagingUrl?: string | null;
};

const PINS = {
	checkout:
		"actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2",
	trivy:
		"aquasecurity/trivy-action@18f2510ee396bbf400402947b394f2dd8c87dbb0 # v0.29.0",
	gitleaks:
		"gitleaks/gitleaks-action@83373cf2f8c4db6e24b41c1a9b086bb9619e9cd3 # v2.3.7",
	syft: "anchore/sbom-action@f325610c9f50a54015d37c8d16cb3b0e2c8f4de0 # v0.18.0",
	zap: "zaproxy/action-baseline@7c4deb10e6261301961c86d65d54a516394f9aed # v0.14.0",
} as const;

// GitHub-Actions-Ausdruck ${{ … }} (kein JS-Template)
const gh = (expr: string) => `\${{ ${expr} }}`;

export function githubActionsSnippet(i: CiSnippetInput): string {
	const q = (extra: string) =>
		[
			i.productCode ? `product=${encodeURIComponent(i.productCode)}` : null,
			extra,
		]
			.filter(Boolean)
			.join("&");
	const gate = i.failOn ? `&fail_on=${i.failOn}` : "";
	const post = (file: string, name: string, path = "scan", extra = "full=1") =>
		[
			`        curl --fail-with-body -sS -X POST \\`,
			`          -H "Authorization: Bearer $KLICK_TOKEN" \\`,
			`          --data-binary @${file} \\`,
			`          "${i.baseUrl}/api/ingest/${path}?${q(`name=${name}${path === "scan" ? `&${extra}${gate}` : ""}`)}"`,
		].join("\n");
	return [
		"# .github/workflows/klick-security.yml",
		"name: Security-Checks (Klick)",
		"on:",
		"  push:",
		"    branches: [main]",
		"  schedule:",
		'    - cron: "17 3 * * 1"',
		"permissions:",
		"  contents: read",
		"jobs:",
		"  scan:",
		"    runs-on: ubuntu-latest",
		"    env:",
		`      KLICK_TOKEN: ${gh("secrets.KLICK_TOKEN")}`,
		"    steps:",
		`      - uses: ${PINS.checkout}`,
		"        with:",
		"          fetch-depth: 0",
		"      # Abhängigkeiten, Fehlkonfigurationen, Secrets im Dateisystem",
		`      - uses: ${PINS.trivy}`,
		"        with:",
		"          scan-type: fs",
		"          format: json",
		"          output: trivy.json",
		"      - name: Trivy an Klick",
		"        run: |",
		post("trivy.json", "trivy.json"),
		"      # Secrets in der Git-Historie (schreibt results.sarif; für",
		"      # GitHub-Organisationen GITLEAKS_LICENSE setzen, kostenlos)",
		`      - uses: ${PINS.gitleaks}`,
		"        continue-on-error: true",
		"        env:",
		`          GITHUB_TOKEN: ${gh("secrets.GITHUB_TOKEN")}`,
		`          GITLEAKS_LICENSE: ${gh("secrets.GITLEAKS_LICENSE")}`,
		"          GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false",
		"          GITLEAKS_ENABLE_SUMMARY: false",
		"      - name: gitleaks an Klick (Secrets werden in Klick redigiert)",
		"        if: hashFiles('results.sarif') != ''",
		"        run: |",
		post("results.sarif", "gitleaks.sarif"),
		"      # SBOM je Release (CRA Anhang I Teil II)",
		`      - uses: ${PINS.syft}`,
		"        with:",
		"          format: cyclonedx-json",
		"          output-file: sbom.cdx.json",
		"      - name: SBOM an Klick",
		"        run: |",
		post("sbom.cdx.json", "sbom.cdx.json", "sbom"),
		...(i.stagingUrl
			? [
					"      # Passiver DAST nur gegen das EIGENE Staging",
					`      - uses: ${PINS.zap}`,
					"        continue-on-error: true",
					"        with:",
					`          target: ${i.stagingUrl}`,
					"          allow_issue_writing: false",
					"          fail_action: false",
					"      - name: ZAP an Klick",
					"        run: |",
					post("report_json.json", "zap.json"),
				]
			: []),
		"",
	].join("\n");
}
