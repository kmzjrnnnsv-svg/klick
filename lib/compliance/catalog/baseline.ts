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
			gaps: [
				"Kein dediziertes PAM für Server-Zugänge (SSH nur Key-basiert)",
				"Rezertifizierung von Zugriffsrechten noch manuell",
			],
			next: [
				"Quartalsweiser Access-Review-Task (P3)",
				"Sitzungsliste mit Geräte-/Ortsanzeige, Login-Benachrichtigung (P1)",
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
			next: [
				"KEK-Rotationsskript (P5)",
				"KMS/HSM spätestens mit Lizenzstufe 2",
			],
		},
		{
			domain: "operations",
			title: "Betrieb, Protokollierung, Überwachung",
			present: [
				"Append-only Audit-Log mit SHA-256-Hash-Kette je Org, tägliche Kettenprüfung mit Alarm",
				"Strukturiertes Logging (pino) mit Redaction von Tokens, URLs, PII",
				"systemd-Sandbox (ProtectSystem=strict, NoNewPrivileges, SystemCallFilter), Secrets über LoadCredentialEncrypted",
				"Health-/Ready-Endpunkte, chrony, unattended-upgrades",
			],
			gaps: [
				"Kein SIEM/SOC; Alarme nur für Kettenbruch und MFA-Lockout",
				"Kein externer Uptime-Check, kein Error-Tracking (GlitchTip P5)",
				"Keine CIS-Baseline-Prüfung der Server",
			],
			next: [
				"Alarmregeln (Login neues Land, Export > 1 000 Zeilen) (P2)",
				"GlitchTip (P5)",
			],
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
				"Kein DAST in CI (ZAP-Baseline P1)",
				"Kein externer Pentest",
				"Change-Management informell (PR + CI, kein Freigabeworkflow)",
			],
			next: [
				"ZAP-Baseline (P1)",
				"Externer Pentest vor Go-Live (Testprogramm)",
			],
		},
		{
			domain: "network",
			title: "Netz",
			present: [
				"nftables: nur 22/80/443; nginx Rate-Limit-Zonen (/api/auth 10 r/min je IP)",
				"Postgres nur über localhost",
				"Vollständiger Security-Header-Satz (CSP, HSTS, COOP/CORP, Permissions-Policy, X-Frame-Options)",
			],
			gaps: ["CSP mit 'unsafe-inline' bis Nonce (P1)", "Kein CDN/DDoS-Schutz"],
			next: ["Nonce-CSP (P1)", "CrowdSec (P5)"],
		},
		{
			domain: "continuity",
			title: "Kontinuität",
			present: [
				"Tägliche pg_dump-Backups, age-verschlüsselt, Offsite via rclone, 30 Tage",
				"Restore-Skript vorhanden",
			],
			gaps: [
				"Restore noch nicht als wiederkehrender Test mit Nachweis",
				"Single-Server: keine Redundanz, kein Failover",
			],
			next: [
				"Restore-Test quartalsweise als Pflicht-Lauf (P3)",
				"Replikation prüfen (Stufe 2)",
			],
		},
		{
			domain: "governance",
			title: "Governance & Dokumentation",
			present: [
				"Architektur-Entscheidungen als ADRs, Threat Model, Deploy-Runbook",
				"Kommunikationskanal für Sicherheitsmeldungen (security.txt, SECURITY.md)",
			],
			gaps: [
				"Keine freigegebene Leitlinie, keine Themenrichtlinien",
				"Pflichtfunktionen nicht formal besetzt (Solo-Betrieb)",
				"Kein Risikoregister, kein Auditprogramm, keine Managementbewertung",
			],
			next: [
				"Dokument-Vorlagen übernehmen und freigeben (P2)",
				"Rollenregister, Beschlüsse, Managementbewertung (P3)",
			],
		},
		{
			domain: "supplier",
			title: "Dienstleister",
			present: [
				"Hetzner (Hosting), Brevo/Resend (Mail), GitHub (Code) als Seed im Register",
			],
			gaps: [
				"Keine Due-Diligence-Akten, keine Art.-30-Klausel-Checkliste, kein Exit-Plan",
			],
			next: ["Dienstleister-Register vervollständigen (P2)"],
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
			status: "in_progress",
			note: "keyVersion und Kms-Interface vorhanden; KEK als systemd-Credential statt KMS.",
			evidence: ["lib/crypto/kms.ts"],
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
			status: "planned",
			note: "Nur Kettenbruch- und Lockout-Alarme; weitere Alarmregeln P2.",
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
			status: "planned",
			note: "ZAP-Baseline (P1), externer Pentest vor Go-Live.",
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
			note: "Threat Model als erster Risikoblick; Register folgt (P2).",
		},
		{
			code: "CC-AST-01",
			status: "in_progress",
			note: "Assets als Seed (Server, DB, Storage, Repo); Owner = Betreiber.",
		},
		{
			code: "CC-AST-10",
			status: "planned",
			note: "Retention-Job (P4); Audit-Log und GwG-Aufzeichnungen ausgenommen.",
		},
		{
			code: "CC-TPR-01",
			status: "in_progress",
			note: "Drei Dienstleister als Seed; Verträge/Kritikalität nachzutragen.",
		},
		{
			code: "CC-CMP-01",
			status: "in_progress",
			note: "Datenschutzerklärung im CMS; VVT und DSFA (P5).",
		},
		{
			code: "CC-INC-01",
			status: "planned",
			note: "Vorfallregister kommt mit /vorfaelle (P2).",
		},
		{
			code: "CC-INC-03",
			status: "planned",
			note: "Fristenuhren je Regime kommen mit /vorfaelle (P2).",
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
