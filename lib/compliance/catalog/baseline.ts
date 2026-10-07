import type { CatalogBaseline } from "./types";

// Ist-Stand der Plattform (Mandant 0). Eine Quelle für zwei Dinge: den
// Baseline-Seed beim Onboarding der Betreiber-Org (applyBaseline) und die
// Seite /baseline („was ist technisch bereits umgesetzt"). Controls ohne
// Eintrag bleiben not_started. Ehrlich bleiben — der Stand ist der Nachweis.

export const BASELINE: CatalogBaseline = {
	asOf: "2026-10-07",
	narrative: [
		{
			domain: "access",
			title: "Identität & Zugang",
			present: [
				"MFA-Pflicht für alle Rollen (TOTP, Passkeys/FIDO2), Enrolment beim ersten Login erzwungen",
				"Sitzungsregeln: Idle 30 min, absolut 12 h, Step-up ≤ 10 min für sensible Aktionen",
				"Rollenmodell owner/editor/viewer/auditor; Prüfer-Zugänge laufen über accessUntil ab",
				"Plattform-Admin mit IP-Allowlist, jeder Plattform-Zugriff mit Begründung im Audit-Log",
				"Mandantentrennung in Postgres (RLS + FORCE auf jeder Org-Tabelle), App-Rolle ohne BYPASSRLS",
			],
			gaps: ["Kein dediziertes PAM für Server-Zugänge (SSH nur Key-basiert)"],
			next: [
				"SSO je Organisation (OIDC, DNS-verifiziert) für Kunden ausrollen",
				"Passkey als Pflichtfaktor für Plattform-Admins erzwingen",
			],
		},
		{
			domain: "crypto",
			title: "Kryptografie",
			present: [
				"Per-Org-DEK, mit KEK umschlossen (Envelope, XChaCha20-Poly1305), Schlüsselversion ab Tag 1",
				"Feldverschlüsselung sensibler Spalten mit dem Org-Schlüssel",
				"TLS 1.2/1.3 mit HSTS-Preload, OCSP-Stapling (nginx)",
			],
			gaps: [
				"KEK liegt als systemd-Credential, nicht in einem KMS/HSM",
				"Datenbank-Volume nicht separat verschlüsselt (Hetzner-Volume-Verschlüsselung ausstehend)",
			],
			next: ["KMS/HSM spätestens mit Lizenzstufe 2 (Kms-Interface steht)"],
		},
		{
			domain: "operations",
			title: "Betrieb, Protokollierung, Überwachung",
			present: [
				"Append-only Audit-Log mit SHA-256-Hash-Kette je Org, tägliche Kettenprüfung mit Alarm",
				"Strukturiertes Logging (pino) mit Redaction von Tokens, URLs, PII; Fehler-Tracking nach GlitchTip gescrubbt (ohne SDK)",
				"KEK-Rotation ohne Re-Encrypt (pnpm kek:rotate), Rate-Limit je Organisation, optionaler clamd-Scan fail closed",
				"systemd-Sandbox (ProtectSystem=strict, NoNewPrivileges, SystemCallFilter), Secrets über LoadCredentialEncrypted",
				"Health-/Ready-Endpunkte, chrony, unattended-upgrades",
			],
			gaps: [
				"Kein SIEM/SOC; Alarme für Kettenbruch, MFA-Lockout, neues Gerät",
				"Kein externer Uptime-Check; GlitchTip-Instanz muss auf dem Server installiert werden",
				"Keine CIS-Baseline-Prüfung der Server",
			],
			next: ["Externer Uptime-Check", "CrowdSec nach Runbook ausrollen"],
		},
		{
			domain: "development",
			title: "Entwicklung & Lieferkette",
			present: [
				"CI mit Typecheck, Biome, Vitest, RLS-Integrationstests, pnpm audit, OSV, gitleaks, CodeQL, CycloneDX-SBOM",
				"pnpm minimumReleaseAge 7 Tage, Lifecycle-Skripte blockiert, Lockfile, Dependabot",
				"Threat Model (STRIDE light), SECURITY.md, security.txt",
				"Getrennte Datenbanken für Entwicklung, Test und Produktion",
			],
			gaps: [
				"Kein externer Pentest",
				"Change-Management informell (PR + CI, kein Freigabeworkflow)",
			],
			next: ["Externer Pentest vor Go-Live (Testprogramm)"],
		},
		{
			domain: "network",
			title: "Netz",
			present: [
				"nftables: nur 22/80/443; nginx Rate-Limit-Zonen (/api/auth 10 r/min je IP)",
				"Postgres nur über localhost",
				"Vollständiger Security-Header-Satz (CSP, HSTS, COOP/CORP, Permissions-Policy, X-Frame-Options)",
			],
			gaps: [
				"Style-CSP mit 'unsafe-inline' (Tailwind/RSC)",
				"Kein CDN/DDoS-Schutz",
			],
			next: ["CrowdSec mit nftables-Bouncer (Runbook in deploy/README.md)"],
		},
		{
			domain: "continuity",
			title: "Kontinuität",
			present: [
				"Tägliche pg_dump-Backups, age-verschlüsselt, Offsite via rclone, 30 Tage",
				"Restore-Skript vorhanden",
			],
			gaps: ["Single-Server: keine Redundanz, kein Failover"],
			next: ["Replikation prüfen (Stufe 2)"],
		},
		{
			domain: "governance",
			title: "Governance & Dokumentation",
			present: [
				"Architektur-Entscheidungen als ADRs, Threat Model, Deploy-Runbook",
				"Kommunikationskanal für Sicherheitsmeldungen (security.txt, SECURITY.md)",
			],
			gaps: [
				"Leitlinie und Themenrichtlinien aus den Vorlagen noch nicht freigegeben",
				"Pflichtfunktionen nicht formal besetzt (Solo-Betrieb)",
			],
			next: [
				"Vorlagen übernehmen, freigeben, Kenntnisnahme einholen",
				"Rollenregister besetzen, erste Managementbewertung durchführen",
			],
		},
		{
			domain: "supplier",
			title: "Dienstleister",
			present: [
				"Hetzner (Hosting), Brevo/Resend (Mail), GitHub (Code) als Seed im Register",
				"Lieferantenpaket der Plattform mit Art.-30-Zusagen, Registerdatenblatt und Subunternehmern unter /vertrauen",
			],
			gaps: [
				"Due-Diligence-Akten und Exit-Plan je Dienstleister noch nicht hinterlegt",
			],
			next: [
				"Dienstleister-Register vervollständigen, Ausstiegsplan aus Vorlage freigeben",
			],
		},
	],
	controls: [
		// Identität & Zugang
		{
			code: "CC-IAM-01",
			status: "in_progress",
			note: "Rollenmodell + RLS umgesetzt; schriftliches Berechtigungskonzept fehlt.",
			evidence: [
				"lib/auth/permissions.ts",
				"db/rls.ts",
				"tests/isolation.matrix.test.ts",
			],
		},
		{
			code: "CC-IAM-02",
			status: "in_progress",
			note: "Einladung, Rollenwechsel, Entfernen mit Sitzungswiderruf; kein HR-gekoppelter JML-Prozess.",
			evidence: ["app/actions/team.ts"],
		},
		{
			code: "CC-IAM-03",
			status: "implemented",
			note: "MFA für alle Rollen, Passkeys, Lockout nach 5 Fehlversuchen.",
			evidence: ["lib/auth/server.ts", "lib/auth/guards.ts"],
		},
		{
			code: "CC-IAM-04",
			status: "in_progress",
			note: "Plattform-Admin: Passkey, IP-Allowlist, Audit. Server-PAM fehlt.",
			evidence: ["lib/auth/guards.ts#requirePlatformAdmin"],
		},
		{
			code: "CC-IAM-05",
			status: "planned",
			note: "Quartalsweiser Access-Review-Task kommt mit dem Kalender (P3).",
		},
		{
			code: "CC-IAM-06",
			status: "implemented",
			note: "Branch-Schutz, Reviews, CI-Pflicht auf dem Hauptzweig.",
		},
		{
			code: "CC-IAM-08",
			status: "implemented",
			note: "Idle 30 min, absolut 12 h, Step-up ≤ 10 min — pure Regeln mit Tests.",
			evidence: ["lib/auth/session-rules.ts", "tests/session-rules.test.ts"],
		},
		// Kryptografie
		{
			code: "CC-CRY-01",
			status: "in_progress",
			note: "Nachweise werden mit Org-DEK verschlüsselt; DB-Volume noch unverschlüsselt.",
			evidence: ["lib/crypto/envelope.ts"],
		},
		{
			code: "CC-CRY-02",
			status: "implemented",
			note: "Feldverschlüsselung (enc1:) mit Org-DEK.",
			evidence: ["lib/crypto/fields.ts"],
		},
		{
			code: "CC-CRY-03",
			status: "implemented",
			note: "keyVersion im Envelope, Kms-Interface, KEK-Rotation per Skript ohne Re-Encrypt; KEK als systemd-Credential.",
			evidence: [
				"lib/crypto/kms.ts",
				"lib/crypto/rotate.ts",
				"scripts/rotate-kek.ts",
			],
		},
		{
			code: "CC-CRY-04",
			status: "planned",
			note: "Kryptokonzept als Dokument steht aus (Vorlage P2).",
		},
		{
			code: "CC-CRY-05",
			status: "implemented",
			note: "TLS 1.2/1.3, HSTS preload, OCSP-Stapling.",
			evidence: ["deploy/nginx/raza.work.conf"],
		},
		// Betrieb & Protokollierung
		{
			code: "CC-OPS-03",
			status: "in_progress",
			note: "Dependabot, OSV, unattended-upgrades; keine Scan-Berichte mit SLA-Tracking.",
		},
		{
			code: "CC-OPS-04",
			status: "in_progress",
			note: "nginx/systemd/nftables versioniert im Repo; keine CIS-Prüfung.",
			evidence: ["deploy/"],
		},
		{
			code: "CC-OPS-05",
			status: "in_progress",
			note: "Health/Ready-Endpunkte; kein externer Uptime-Check.",
			evidence: ["app/api/health/route.ts", "app/api/ready/route.ts"],
		},
		{
			code: "CC-OPS-08",
			status: "in_progress",
			note: "Deploy-Runbook, Backup/Restore-Skripte dokumentiert.",
			evidence: ["deploy/README.md"],
		},
		{
			code: "CC-OPS-09",
			status: "implemented",
			note: "chrony auf dem Server.",
		},
		{
			code: "CC-OPS-10",
			status: "implemented",
			note: "systemd-Sandbox, LoadCredentialEncrypted, read-only App-Verzeichnis.",
			evidence: ["deploy/systemd/klick.service"],
		},
		{
			code: "CC-LOG-01",
			status: "implemented",
			note: "Append-only audit_log, Hash-Kette je Org, tägliche Prüfung.",
			evidence: ["lib/audit.ts", "lib/audit-hash.ts", "lib/jobs/register.ts"],
		},
		{
			code: "CC-LOG-02",
			status: "in_progress",
			note: "Alarme für Kettenbruch, Lockout, neues Gerät; Fehler-Tracking nach GlitchTip gescrubbt. Kein SIEM.",
			evidence: ["lib/observability/glitchtip.ts", "instrumentation.ts"],
		},
		{
			code: "CC-LOG-03",
			status: "in_progress",
			note: "pino mit Redaction; schriftliches Logging-Konzept fehlt.",
			evidence: ["lib/log.ts"],
		},
		// Netz
		{
			code: "CC-NET-01",
			status: "in_progress",
			note: "Postgres nur lokal; keine formale Segmentierung dokumentiert.",
		},
		{
			code: "CC-NET-02",
			status: "implemented",
			note: "nftables, nginx Rate-Limits, Security-Header.",
			evidence: ["deploy/firewall.nft", "next.config.ts"],
		},
		// Entwicklung
		{
			code: "CC-DEV-01",
			status: "in_progress",
			note: "Pipeline-Pflichten in AGENTS.md und CI; keine formale SDLC-Richtlinie.",
		},
		{
			code: "CC-DEV-02",
			status: "in_progress",
			note: "Threat Model vorhanden; ASVS-Katalog nicht formal abgenommen.",
			evidence: ["docs/security/threat-model.md"],
		},
		{
			code: "CC-DEV-03",
			status: "implemented",
			note: "TypeScript strict, Biome, CodeQL in CI.",
			evidence: [".github/workflows/codeql.yml"],
		},
		{
			code: "CC-DEV-04",
			status: "in_progress",
			note: "ZAP-Baseline in CI; externer Pentest vor Go-Live offen.",
			evidence: [".github/workflows/zap-baseline.yml"],
		},
		{
			code: "CC-DEV-05",
			status: "implemented",
			note: "minimumReleaseAge 7 Tage, ignore-scripts, SBOM, OSV, gitleaks, Dependabot.",
			evidence: ["pnpm-workspace.yaml", ".github/workflows/ci.yml"],
		},
		{
			code: "CC-DEV-06",
			status: "in_progress",
			note: "PR + CI; Notfall-Changes nicht formal geregelt.",
		},
		{
			code: "CC-DEV-07",
			status: "implemented",
			note: "Getrennte Datenbanken (klick, klick_test), getrennte Rollen; keine Prod-Daten in Dev.",
		},
		// Kontinuität
		{
			code: "CC-BCM-03",
			status: "in_progress",
			note: "Backups verschlüsselt und offsite; Restore-Test noch nicht als Nachweis.",
			evidence: ["scripts/backup-db.sh", "scripts/restore-db.sh"],
		},
		{
			code: "CC-BCM-04",
			status: "not_started",
			note: "Single-Server-Betrieb.",
		},
		// Governance & Compliance
		{
			code: "CC-GOV-09",
			status: "in_progress",
			note: "security.txt und SECURITY.md; Kommunikationsmatrix fehlt.",
			evidence: ["public/.well-known/security.txt"],
		},
		{
			code: "CC-GOV-10",
			status: "in_progress",
			note: "Anforderungskatalog als Rechtsquelle im Repo; Monitoring-Prozess fehlt.",
			evidence: ["docs/regulatory/anforderungskatalog-2026-10.md"],
		},
		{
			code: "CC-RSK-02",
			status: "in_progress",
			note: "Threat Model und Risikoregister vorhanden; Bewertung der Plattform-Risiken im Register steht aus.",
		},
		{
			code: "CC-AST-01",
			status: "in_progress",
			note: "Assets als Seed (Server, DB, Storage, Repo); Owner = Betreiber.",
		},
		{
			code: "CC-AST-10",
			status: "implemented",
			note: "Retention-Job täglich; Audit-Log und GwG-Aufzeichnungen ausgenommen; Org-Löschung mit Crypto-Shredding und Löschbestätigung.",
			evidence: ["lib/jobs/retention.ts", "app/actions/settings.ts"],
		},
		{
			code: "CC-TPR-01",
			status: "in_progress",
			note: "Drei Dienstleister als Seed; Verträge/Kritikalität nachzutragen.",
		},
		{
			code: "CC-CMP-01",
			status: "in_progress",
			note: "Datenschutzerklärung im CMS, VVT-Startliste, Betroffenenanfragen mit Monatsfrist, vollständiger Export; DSFA für die Plattform selbst offen.",
			evidence: [
				"lib/compliance/catalog/processing-activities.ts",
				"app/api/export/organisation.zip/route.ts",
			],
		},
		{
			code: "CC-INC-01",
			status: "implemented",
			note: "Vorfallregister mit Klassifizierung je Regime; Meldezusage ≤ 24 h an Kunden unter /vertrauen.",
			evidence: [
				"app/(app)/vorfaelle",
				"lib/compliance/catalog/platform-supplier.ts",
			],
		},
		{
			code: "CC-INC-03",
			status: "implemented",
			note: "Fristenuhren DORA/NIS2/DSGVO ab Kenntnis bzw. Abgabe des Vorberichts.",
			evidence: ["lib/compliance/incident.ts"],
		},
	],
	providers: [
		{
			name: "Hetzner Online GmbH",
			partnerType: "ict",
			serviceType: "hosting",
			serviceDescription:
				"Cloud-Server, Object Storage, Firewall — Produktion und Backups",
			criticality: "critical",
			country: "DE",
			dataLocations: ["Falkenstein (DE)", "Nürnberg (DE)"],
			isMaterial: true,
			processesPersonalData: true,
		},
		{
			name: "Brevo (Sendinblue SAS)",
			partnerType: "ict",
			serviceType: "cloud_saas",
			serviceDescription:
				"Transaktionale E-Mail (Magic Links, Benachrichtigungen) via SMTP-Relay",
			criticality: "important",
			country: "FR",
			dataLocations: ["EU"],
			isMaterial: false,
			processesPersonalData: true,
		},
		{
			name: "GitHub, Inc.",
			partnerType: "ict",
			serviceType: "cloud_saas",
			serviceDescription: "Quellcode-Hosting, CI/CD, Dependabot, CodeQL",
			criticality: "important",
			country: "US",
			dataLocations: ["US", "EU"],
			isMaterial: false,
			processesPersonalData: false,
		},
	],
	assets: [
		{
			name: "Anwendungsserver (Next.js, systemd)",
			type: "system",
			classification: "confidential",
			description:
				"Produktionsserver bei Hetzner, nginx + Node-Prozess in systemd-Sandbox",
			provider: "Hetzner Online GmbH",
		},
		{
			name: "PostgreSQL 16 (Mandantendaten)",
			type: "data",
			classification: "secret",
			description: "Alle Mandantendaten mit RLS; Audit-Log mit Hash-Kette",
			provider: "Hetzner Online GmbH",
		},
		{
			name: "Object Storage (Nachweise, Backups)",
			type: "service",
			classification: "secret",
			description:
				"Verschlüsselte Nachweise (Org-DEK) und age-verschlüsselte Backups",
			provider: "Hetzner Online GmbH",
		},
		{
			name: "Quellcode-Repository",
			type: "application",
			classification: "confidential",
			description: "Git-Repository mit CI/CD-Pipelines",
			provider: "GitHub, Inc.",
		},
	],
};
