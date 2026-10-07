# Regulatorischer Anforderungskatalog – ISO 27001, DORA, NIS2, MaRisk/BAIT, MiCAR, GwG/TFR, ZAG/PSD2

**Rechtsstand:** 6. Oktober 2026 · **Quelle:** vom Betreiber bereitgestellter Katalog (Session 06.10.2026)

> **Zweck im Repo.** Dieses Dokument ist die **Authoring-Quelle** für die
> Anforderungs-Indizes in `lib/compliance/catalog/*.ts`:
>
> | Spalte hier | Ziel im Code |
> |---|---|
> | Gliederungsebene (1.1, 2.3 …) | `framework_sections` in der Reihenfolge des Regelwerks |
> | Passage / Artikel / Paragraph | `CatalogRequirement.code` |
> | Anforderung | `CatalogRequirement.title` + `requirementText` (ISO: Paraphrase) |
> | Nachweis / Artefakt | `CatalogRequirement.evidenceHints` |
> | Produkte (Start-up · Skalierung) | `recommendations.tools { startup, scale }` + `tool-landscape.ts` |
> | „Gilt für DORA-Institut?" (NIS2) | `appliesToRoles` + `requirement_applicability` (`lex_specialis`) |
> | Status (BAIT/ZAIT) | `legalStatus: "repealed"` |
>
> Korrekturen am ursprünglichen Plan, die sich aus diesem Katalog ergeben, sind
> in der Plan-Sektion „Abgleich mit dem Anforderungskatalog" dokumentiert.
>
> **Kein Rechtsrat.** Produktnennungen sind Marktbeispiele ohne Bezahlung oder
> Empfehlung im Rechtssinn; Due Diligence nach DORA Art. 28 bleibt Pflicht.

## Einleitung und Lesehilfe

Dieser Katalog geht jedes Regelwerk in seiner eigenen Gliederungsreihenfolge durch: Passage → Anforderung → Nachweis (Artefakt) → konkrete Produkte. Zielbild ist ein deutsches Zahlungsinstitut (ZAG) mit MiCAR-Krypto-Lizenz (CASP), z. B. für Stablecoin-Zahlungsabwicklung in Gastronomie und Hotellerie. Rechtsstand: Oktober 2026.

### Wichtigste Korrekturen gegenüber der Google-KI-Liste

| Punkt | Google-Liste | Tatsächlicher Stand |
|---|---|---|
| BAIT | als geltende Pflicht referenziert | Für DORA-pflichtige Institute seit 17.01.2025 nicht mehr anwendbar; vollständige Aufhebung mit Ablauf 31.12.2026 (Bundesbank) |
| ZAIT | nicht erwähnt | Mit Ablauf 16.01.2025 aufgehoben (KPMG) |
| MaRisk | für alle angenommen | Gilt für KWG-Institute. Für Zahlungs-/E-Geld-Institute gelten die eigenen ZAG-MaRisk (Rundschreiben 07/2024) (paytechlaw) |
| NIS2-Meldefristen 24h/72h | als Pflicht gelistet | DORA ist lex specialis; für Finanzunternehmen bleiben aus dem BSIG v. a. Registrierung und Organisationspflichten (KPMG) |
| DORA-Meldefristen | „enge Fristen" | Erstmeldung ≤ 4 h nach Einstufung als schwerwiegend, spätestens 24 h nach Kenntnis; Zwischenmeldung ≤ 72 h; Abschlussmeldung ≤ 1 Monat (regulation-dora.eu) |
| ZAG § 54 Vorfallmeldung | separat | Zahlungsbezogene Vorfälle laufen seit 17.01.2025 über DORA Art. 23 (springlex) |
| TLPT, Whitepaper, ART/EMT-Sanierungspläne | pauschal Pflicht | Nur für benannte Institute (TLPT) bzw. Emittenten/Anbieter von Token, nicht für jeden CASP |

**Lex-specialis-Kette.** DORA verdrängt für IKT-Themen NIS2 (Art. 4 NIS2, § 28 BSIG) und die xAIT. ISO 27001 ist freiwillig, aber das beste Gerüst, um DORA-Nachweise zu bündeln. Ab 10.07.2027 ersetzt die EU-Geldwäscheverordnung (AMLR) große Teile des GwG.

**Proportionalität.** Den vereinfachten Rahmen nach DORA Art. 16 dürfen nur bestimmte Kleinstfälle nutzen (u. a. nach PSD2 Art. 32 ausgenommene Zahlungsinstitute, kleine nicht verflochtene Wertpapierfirmen). Ein voll lizenziertes ZAG-Institut mit CASP-Zulassung fällt nicht darunter; Erleichterung gibt es nur über das allgemeine Verhältnismäßigkeitsprinzip in Art. 4. Produkte sind daher jeweils als Start-up (günstig, schnell) und Skalierung (Enterprise) angegeben.

**Hinweis.** Kein Rechtsrat. Produktnennungen sind Marktbeispiele ohne Bezahlung oder Empfehlung im Rechtssinn; Due Diligence nach DORA Art. 28 bleibt Pflicht.

## 1. ISO/IEC 27001:2022

ISO 27001 ist nicht gesetzlich vorgeschrieben, deckt aber rund zwei Drittel der DORA-Kapitel-II-Nachweise ab und ist das Rückgrat des Dokumentenpakets. Pflichtdokumente der Norm sind mit **(P)** markiert.

### 1.1 Managementsystem-Klauseln 4–10

| Klausel | Anforderung | Nachweis / Artefakt | Produkte (Start-up · Skalierung) |
|---|---|---|---|
| 4.1 Kontext | Interne und externe Themen bestimmen | Kontextanalyse (SWOT/PESTEL) | GRC-Tool: Secjur, Vanta, Drata, verinice · HiScout GRC, ServiceNow IRM |
| 4.2 Interessierte Parteien | Anforderungen von BaFin, Bundesbank, Kunden, Partnern erfassen | Stakeholder- und Rechtsregister | wie 4.1 |
| 4.3 Anwendungsbereich | Scope inkl. Schnittstellen festlegen | (P) Scope-Dokument | wie 4.1 |
| 4.4 ISMS | ISMS aufbauen, betreiben, verbessern | ISMS-Handbuch, Prozesslandkarte | Confluence, Claude Docs · ServiceNow |
| 5.1 Führung | Commitment der Geschäftsleitung | Freigabeprotokolle, Management-Bewertung | — |
| 5.2 Politik | Informationssicherheitsleitlinie | (P) Leitlinie, von GL unterschrieben | Dokumentenlenkung im GRC-Tool |
| 5.3 Rollen | Verantwortung und Befugnisse zuweisen | Rollenbeschreibungen ISB, RACI | — |
| 6.1.1 Risiken/Chancen | Maßnahmen zur Behandlung planen | Risiko- und Chancenregister | GRC-Tool |
| 6.1.2 Risikobeurteilung | Methode mit Kriterien und Akzeptanzschwelle | (P) Risikobeurteilungsmethodik, (P) Ergebnisse | GRC-Tool; Methode: ISO 27005, BSI 200-3 |
| 6.1.3 Risikobehandlung | Controls wählen, SoA, Behandlungsplan | (P) Erklärung zur Anwendbarkeit (SoA), (P) Risikobehandlungsplan | GRC-Tool |
| 6.2 Ziele | Messbare Sicherheitsziele | (P) Zielkatalog mit KPIs | GRC-Tool, Power BI |
| 6.3 Änderungsplanung | ISMS-Änderungen geplant durchführen | Change-Protokoll ISMS | Jira |
| 7.1 Ressourcen | Ressourcen bereitstellen | Budget- und Personalplan | — |
| 7.2 Kompetenz | Kompetenz nachweisen | (P) Qualifikationsnachweise | HR-System: Personio |
| 7.3 Bewusstsein | Mitarbeitende kennen Leitlinie und Pflichten | Awareness-Nachweise | SoSafe, KnowBe4, Hornetsecurity |
| 7.4 Kommunikation | Wer kommuniziert was mit wem | Kommunikationsmatrix | — |
| 7.5 Dokumentierte Information | Lenkung, Versionierung, Zugriff | (P) Dokumentenlenkungsregel | Confluence, SharePoint · OpenText |
| 8.1 Betrieb | Prozesse planen und steuern | Betriebsdokumentation | ITSM: Jira Service Management · ServiceNow |
| 8.2 / 8.3 | Risikobeurteilung und -behandlung regelmäßig durchführen | (P) aktuelle Ergebnisse | GRC-Tool |
| 9.1 Überwachung | Messen und bewerten | (P) Messergebnisse, KPI-Report | GRC-Tool, Grafana |
| 9.2 Internes Audit | Auditprogramm, unabhängige Auditoren | (P) Auditprogramm und -berichte | GRC-Audit-Modul; externer Auditor (z. B. TÜV, DEKRA, usd) |
| 9.3 Managementbewertung | Jährliche Bewertung durch GL | (P) Protokoll Management-Review | — |
| 10.1 Verbesserung | Kontinuierlich verbessern | Verbesserungslog | Jira |
| 10.2 Abweichungen | Korrekturmaßnahmen | (P) Nachweis Nichtkonformitäten und Korrekturen | Jira, GRC-Findings-Log |

### 1.2 Annex A – Organisatorische Maßnahmen (A.5.1–A.5.37)

| Control | Anforderung (kurz) | Nachweis | Produkte |
|---|---|---|---|
| A.5.1 | Richtlinien für Informationssicherheit | Leitlinie + Themenrichtlinien | GRC-Tool |
| A.5.2 | Rollen und Verantwortlichkeiten | Rollenmodell | — |
| A.5.3 | Aufgabentrennung | SoD-Matrix | IAM: Entra ID Governance, Okta Identity Governance |
| A.5.4 | Verantwortung der Leitung | Verpflichtungserklärungen | — |
| A.5.5 | Kontakt mit Behörden | Behördenliste (BaFin, Bundesbank, BSI, FIU, LKA) | — |
| A.5.6 | Kontakt mit Interessengruppen | Mitgliedschaften | Allianz für Cybersicherheit, FS-ISAC, Bitkom |
| A.5.7 | Bedrohungsintelligenz | Threat-Intel-Prozess | CERT-Bund-Warnungen (kostenlos) · Recorded Future, Mandiant, TRM/Chainalysis Threat Intel |
| A.5.8 | Sicherheit im Projektmanagement | Projekt-Sicherheitscheckliste | Jira-Vorlagen |
| A.5.9 | Inventar von Informationen und Werten | Asset-Inventar | Snipe-IT, Lansweeper · ServiceNow CMDB; Cloud: Wiz, AWS Config |
| A.5.10 | Zulässiger Gebrauch | Acceptable Use Policy | — |
| A.5.11 | Rückgabe von Werten | Austrittscheckliste | Personio + Intune |
| A.5.12 | Klassifizierung | Klassifizierungsschema | Microsoft Purview Information Protection |
| A.5.13 | Kennzeichnung | Labeling-Regeln | Microsoft Purview |
| A.5.14 | Informationsübertragung | Übertragungsrichtlinie | TLS, Tresorit, Boxcryptor-Nachfolger (Dropbox), S/MIME |
| A.5.15 | Zugangssteuerung | Zugangsrichtlinie | Entra ID, Okta |
| A.5.16 | Identitätsmanagement | Joiner-Mover-Leaver-Prozess | Entra ID, Okta, Personio-Kopplung |
| A.5.17 | Authentisierungsinformationen | Passwort-/MFA-Richtlinie | 1Password Business, Bitwarden; YubiKey FIDO2 |
| A.5.18 | Zugangsrechte | Rezertifizierungsprotokolle | Entra ID Access Reviews · SailPoint, Saviynt |
| A.5.19 | Sicherheit in Lieferantenbeziehungen | Lieferantenrichtlinie | TPRM: Vanta/Drata-Modul · OneTrust TPRM, Mitratech Prevalent, Panorays |
| A.5.20 | Sicherheit in Lieferantenverträgen | Vertragsklauseln | Vertragsvorlagen (siehe DORA Art. 30) |
| A.5.21 | IKT-Lieferkette | Sub-Dienstleister-Analyse | wie A.5.19 |
| A.5.22 | Überwachung von Lieferanten | Jährliche Reviews, SOC-2-/ISAE-3402-Berichte | wie A.5.19 |
| A.5.23 | Cloud-Dienste | Cloud-Richtlinie, Exit-Plan | AWS/Azure/Google (Region Frankfurt), BSI C5-Testate |
| A.5.24 | Planung Vorfallmanagement | Incident-Response-Plan | Jira Service Management, PagerDuty, Opsgenie |
| A.5.25 | Bewertung von Ereignissen | Klassifizierungsschema | Sentinel/Splunk (siehe A.8.15) |
| A.5.26 | Reaktion auf Vorfälle | Playbooks | SOAR: Sentinel Playbooks, Tines, Splunk SOAR |
| A.5.27 | Lernen aus Vorfällen | Post-Mortems | Jira, Confluence |
| A.5.28 | Sammeln von Beweisen | Forensik-Leitfaden | Velociraptor, Magnet AXIOM; Retainer: Mandiant, CrowdStrike, HiSolutions |
| A.5.29 | Sicherheit bei Störungen | Notfall-Sicherheitsvorgaben | HiScout BCM, Fusion |
| A.5.30 | IKT-Bereitschaft für Business Continuity | BIA, Wiederanlauftests | Veeam, Rubrik; Multi-AZ-Cloud |
| A.5.31 | Rechtliche Anforderungen | Rechtskataster | GRC-Tool, Haufe Compliance, regulatorisches Horizon Scanning (FIS-Rechtskataster, PwC Plus) |
| A.5.32 | Geistiges Eigentum | Lizenzverzeichnis | Lansweeper, FlexNet |
| A.5.33 | Schutz von Aufzeichnungen | Aufbewahrungs-/Löschkonzept | Revisionssicheres Archiv: d.velop, AWS S3 Object Lock |
| A.5.34 | Datenschutz | Datenschutzmanagement (DSGVO) | DataGuard, OneTrust Privacy, Caralegal |
| A.5.35 | Unabhängige Überprüfung | Externe Audits | Zertifizierer (TÜV SÜD, DEKRA, DQS) |
| A.5.36 | Einhaltung von Richtlinien | Compliance-Checks | GRC-Tool |
| A.5.37 | Dokumentierte Betriebsabläufe | Betriebshandbücher | Confluence, Runbooks in Git |

### 1.3 Annex A – Personenbezogene Maßnahmen (A.6.1–A.6.8)

| Control | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| A.6.1 | Sicherheitsüberprüfung | Screening-Prozess, Führungszeugnis, Bonitätsauskunft für Schlüsselpersonal | HireRight, Sterling; SCHUFA-Auskunft |
| A.6.2 | Beschäftigungsbedingungen | Vertragsklauseln Vertraulichkeit | — |
| A.6.3 | Schulung und Bewusstsein | Schulungsplan, Teilnahmenachweise | SoSafe, KnowBe4; Phishing-Simulation |
| A.6.4 | Disziplinarverfahren | Regelung | — |
| A.6.5 | Pflichten nach Austritt | Austrittsprozess | Personio + Entra ID |
| A.6.6 | Vertraulichkeitsvereinbarungen | NDAs | DocuSign, Skribble (QES) |
| A.6.7 | Remote-Arbeit | Remote-Work-Richtlinie | Zero-Trust: Cloudflare Zero Trust, Zscaler, Tailscale |
| A.6.8 | Meldung von Ereignissen | Meldekanal für Mitarbeitende | Jira-Formular, Teams-Kanal |

### 1.4 Annex A – Physische Maßnahmen (A.7.1–A.7.14)

| Control | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| A.7.1–A.7.4 | Perimeter, Zutritt, Büros sichern, Überwachung | Zonenkonzept, Zutrittsprotokolle | Elektronische Zutrittskontrolle: Salto, dormakaba; Video: Axis |
| A.7.5 | Schutz vor physischen Bedrohungen | Risikoanalyse Standort | Rechenzentrum mit ISO 27001/EN 50600 (Equinix FR, Digital Realty, Telekom) |
| A.7.6 | Arbeiten in Sicherheitsbereichen | Regeln Tresor-/Key-Raum | — |
| A.7.7 | Aufgeräumter Arbeitsplatz | Clean-Desk-Richtlinie | — |
| A.7.8 | Platzierung von Geräten | Aufstellungsplan | — |
| A.7.9 | Geräte außerhalb | Richtlinie mobile Geräte | Intune, Jamf |
| A.7.10 | Speichermedien | Medienrichtlinie | BitLocker, FileVault |
| A.7.11 | Versorgung | USV-Nachweise | RZ-Testat |
| A.7.12 | Verkabelung | Netzplan | RZ-Testat |
| A.7.13 | Instandhaltung | Wartungsprotokolle | — |
| A.7.14 | Sichere Entsorgung | Löschzertifikate | Blancco; zertifizierte Entsorger (DIN 66399) |

### 1.5 Annex A – Technologische Maßnahmen (A.8.1–A.8.34)

| Control | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| A.8.1 | Endgeräte | Härtungs-/MDM-Richtlinie | Microsoft Intune, Jamf, Kandji |
| A.8.2 | Privilegierte Zugangsrechte | PAM-Konzept, Rezertifizierung | Teleport, Delinea · CyberArk, BeyondTrust |
| A.8.3 | Informationszugangsbeschränkung | Berechtigungskonzept | Entra ID, Okta |
| A.8.4 | Zugriff auf Quellcode | Repo-Rechte | GitHub Enterprise, GitLab |
| A.8.5 | Sichere Authentisierung | MFA-Nachweis | FIDO2/YubiKey, Entra ID Conditional Access |
| A.8.6 | Kapazitätssteuerung | Kapazitätsplanung | Datadog, Grafana, AWS CloudWatch |
| A.8.7 | Schutz gegen Schadsoftware | EDR-Abdeckung | Microsoft Defender for Endpoint, CrowdStrike Falcon, SentinelOne |
| A.8.8 | Technische Schwachstellen | Scan-Berichte, Patch-SLAs | Greenbone (DE), Tenable, Qualys, Rapid7; Container: Snyk, Trivy |
| A.8.9 | Konfigurationsmanagement | Baselines (CIS) | Terraform, Ansible; Wiz, Defender for Cloud |
| A.8.10 | Löschung von Informationen | Löschkonzept (DIN 66398) | Blancco; Cloud-Lifecycle-Policies |
| A.8.11 | Datenmaskierung | Maskierungsregeln | Tonic.ai, Delphix |
| A.8.12 | Verhinderung von Datenabfluss | DLP-Regeln | Microsoft Purview DLP, Netskope |
| A.8.13 | Datensicherung | Backup-Konzept, Restore-Tests | Veeam, Rubrik; S3 Object Lock (immutable) |
| A.8.14 | Redundanz | Hochverfügbarkeitskonzept | Multi-AZ/Multi-Region in AWS/Azure |
| A.8.15 | Protokollierung | Logging-Konzept | Microsoft Sentinel, Splunk, Elastic Security, Wazuh (Open Source) |
| A.8.16 | Überwachung | SOC-Nachweise | MDR-Dienst: Arctic Wolf, CrowdStrike Falcon Complete, Telekom MDR |
| A.8.17 | Zeitsynchronisation | NTP-Konfiguration | PTB-NTP, AWS Time Sync |
| A.8.18 | Privilegierte Hilfsprogramme | Freigabeliste | PAM-Tool |
| A.8.19 | Software-Installation | Whitelisting | Intune, ThreatLocker |
| A.8.20 | Netzwerksicherheit | Netzsicherheitskonzept | Palo Alto, Fortinet; Cloud: AWS Security Groups |
| A.8.21 | Sicherheit von Netzdiensten | SLA-Nachweise | Cloudflare, Akamai |
| A.8.22 | Netztrennung | Segmentierungsplan | VPC-Design, Illumio |
| A.8.23 | Webfilterung | Filterregeln | Cloudflare Gateway, Zscaler |
| A.8.24 | Kryptografie | Kryptokonzept, Schlüsselmanagement | HSM: Utimaco (DE), Thales Luna, AWS CloudHSM; KMS: HashiCorp Vault, AWS KMS |
| A.8.25 | Sicherer Entwicklungslebenszyklus | SDLC-Richtlinie | GitHub Advanced Security, GitLab Ultimate |
| A.8.26 | Sicherheitsanforderungen an Anwendungen | Anforderungskatalog | OWASP ASVS |
| A.8.27 | Sichere Architektur | Architekturprinzipien | Threat Modeling: OWASP Threat Dragon, IriusRisk |
| A.8.28 | Sichere Programmierung | Coding-Standards, SAST | SonarQube, Semgrep, Snyk Code |
| A.8.29 | Sicherheitstests | DAST, Pentest-Berichte | OWASP ZAP, Burp Suite; Pentester: SySS, usd, Cure53; Smart Contracts: Trail of Bits, OpenZeppelin, ChainSecurity |
| A.8.30 | Ausgelagerte Entwicklung | Lieferantenvorgaben | Vertragsklauseln |
| A.8.31 | Trennung der Umgebungen | Dev/Test/Prod-Konzept | getrennte Cloud-Accounts (AWS Organizations) |
| A.8.32 | Änderungsmanagement | Change-Prozess | Jira Service Management, ServiceNow |
| A.8.33 | Testdaten | Testdatenrichtlinie | Tonic.ai |
| A.8.34 | Schutz bei Audit-Tests | Audit-Zugriffsregeln | — |

## 2. DORA – Verordnung (EU) 2022/2554

DORA gilt seit 17.01.2025 unmittelbar für Zahlungsinstitute, E-Geld-Institute und CASPs und ist der primäre IT-Pflichtenkatalog. Konkretisiert wird sie durch RTS/ITS, vor allem 2024/1774 (IKT-Risikomanagement), 2024/1772 (Vorfallklassifizierung), 2025/301 und 2025/302 (Meldungen), 2024/1773 (Vertragsrichtlinie), 2024/2956 (Informationsregister) und 2025/1190 (TLPT).

### 2.1 Kapitel II – IKT-Risikomanagement (Art. 5–16)

| Artikel | Anforderung | Nachweis / Artefakt | Produkte (Start-up · Skalierung) |
|---|---|---|---|
| Art. 5 Abs. 2 | Leitungsorgan trägt Endverantwortung, genehmigt Rahmenwerk, Rollen, Budget, Drittparteien-Richtlinie, Wiederanlaufpläne | GL-Beschlüsse, Geschäftsordnung, IKT-Budget-Nachweis | GRC-Tool mit DORA-Framework: Vanta, Drata, Secjur, ISMS.online · HiScout DORA, ServiceNow IRM, OneTrust, Archer |
| Art. 5 Abs. 3 | Rolle zur Überwachung von IKT-Drittanbieter-Vereinbarungen benennen | Ernennungsschreiben | — |
| Art. 5 Abs. 4 | Regelmäßige IKT-Schulung des Leitungsorgans | Schulungsnachweise GL | Externe Executive-Trainings (z. B. Frankfurt School Executive Education); SoSafe-Management-Modul |
| Art. 6 Abs. 1–4 | Dokumentierter IKT-Risikomanagementrahmen, unabhängige Kontrollfunktion (3 Lines of Defence) | Rahmenwerk-Dokument, Organigramm | GRC-Tool |
| Art. 6 Abs. 5 | Jährliche Überprüfung + nach schweren Vorfällen; Bericht an Behörde auf Anfrage | Review-Protokoll | GRC-Tool |
| Art. 6 Abs. 6 | Regelmäßige Prüfung durch Interne Revision | Revisionsplan, Prüfberichte | Ausgelagerte Revision (Big Four, BDO, Forvis Mazars) |
| Art. 6 Abs. 8 | Strategie für digitale operationale Resilienz (Toleranzschwellen, Ziele, Architektur, Kennzahlen) | Resilienzstrategie | — |
| Art. 7 | IKT-Systeme angemessen, zuverlässig, kapazitätsstark, resilient | Architektur- und Kapazitätsnachweise | Datadog, Grafana; Cloud-Well-Architected-Reviews |
| Art. 8 Abs. 1–4 | Geschäftsfunktionen, Rollen, Informations- und IKT-Assets identifizieren, klassifizieren, Abhängigkeiten abbilden | Asset- und Prozessinventar mit Abhängigkeitsmapping | Snipe-IT, Lansweeper · ServiceNow CMDB, LeanIX (EAM) |
| Art. 8 Abs. 5–7 | Drittanbieter-Abhängigkeiten; jährliche Risikobewertung von Altsystemen | Abhängigkeitsregister, Legacy-Risikobewertung | LeanIX, Ardoq |
| Art. 9 | Schutz und Prävention: Netzsicherheit, Zugang, Authentisierung, Verschlüsselung, Change- und Patchmanagement | Richtliniensatz nach RTS 2024/1774 (Sicherheits-, Asset-, Krypto-, Betriebs-, Netz-, Change-, IAM-Richtlinie) | siehe ISO A.8; PAM: Teleport · CyberArk; HSM: Utimaco, Thales |
| Art. 10 | Erkennung anomaler Aktivitäten, mehrere Kontrollebenen, Schwellenwerte | SIEM-Use-Cases, Alarmregeln | Wazuh, Elastic · Microsoft Sentinel, Splunk; MDR: Arctic Wolf, Telekom MDR |
| Art. 11 | IKT-Geschäftsfortführungsleitlinie, BIA, Reaktions- und Wiederherstellungspläne, Krisenmanagementfunktion, jährliche Tests | BCM-Leitlinie, BIA, Notfallpläne, Testberichte | HiScout BCM, Fusion Risk Management; Krisenkommunikation: F24 (FACT24), Everbridge |
| Art. 12 | Backup-Richtlinie, getrennter Standort, RTO/RPO, Wiederherstellungstests | Backup-Konzept, Restore-Protokolle | Veeam, Rubrik, Cohesity; S3 Object Lock |
| Art. 13 | Lernen: Post-Incident-Reviews, Bedrohungsanalyse, Schulungsprogramme für alle | Lessons-Learned-Berichte, Awareness-Programm | SoSafe, KnowBe4; Threat Intel: CERT-Bund, Recorded Future |
| Art. 14 | Krisenkommunikationspläne, benannte Sprecherfunktion | Kommunikationsplan | F24, Everbridge |
| Art. 15 | Konkretisierung durch RTS 2024/1774 | Mapping RTS → Richtlinien | GRC-Tool-Mapping |
| Art. 16 | Vereinfachter Rahmen nur für Kleinstfälle (siehe Einleitung) | Anwendbarkeitsprüfung | — |

### 2.2 Kapitel III – IKT-Vorfälle (Art. 17–23)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 17 | Vorfallmanagementprozess: Erfassen aller Vorfälle, Frühwarnindikatoren, Rollen, Kommunikation, Berichterstattung an GL | Incident-Management-Richtlinie, Vorfallregister | Jira Service Management, PagerDuty · ServiceNow SecOps |
| Art. 18 + RTS 2024/1772 | Klassifizierung nach 7 Kriterien (Kunden, Dauer, Reputation, Geografie, Datenverlust, Kritikalität, wirtschaftliche Auswirkung) | Klassifizierungsmatrix, Bewertungsprotokolle | Entscheidungsbaum im ITSM; GRC-Tool-Workflows |
| Art. 19 + RTS 2025/301, ITS 2025/302 | Meldung schwerwiegender Vorfälle an BaFin: Erstmeldung ≤ 4 h nach Einstufung (≤ 24 h nach Kenntnis), Zwischenmeldung ≤ 72 h, Abschlussmeldung ≤ 1 Monat; Kundeninformation; freiwillige Meldung erheblicher Cyberbedrohungen | Melde-Playbook, ausgefüllte Templates, MVP-Zugang | BaFin-MVP-Portal (Fachverfahren DORA); Rückfall: ikt-vorfall@bafin.de (dr-datenschutz) |
| Art. 20 | Harmonisierte Meldeformate | Template-Bibliothek | Regnology (Meldewesen-Software) · ServiceNow-Integration |
| Art. 22 | Rückmeldung der Behörde verarbeiten | Feedback-Log | — |
| Art. 23 | Auch zahlungsbezogene Betriebs- und Sicherheitsvorfälle (ehem. PSD2-Meldung) nach DORA melden | Erweiterte Klassifizierung für Nicht-IKT-Zahlungsvorfälle | wie Art. 19 |

### 2.3 Kapitel IV – Testen der digitalen operationalen Resilienz (Art. 24–27)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 24 | Risikobasiertes Testprogramm, unabhängige Tester, kritische Systeme mindestens jährlich | Testprogramm, Jahresplan | GRC-Tool |
| Art. 25 | Testarten: Schwachstellenscans, Open-Source-Analysen, Netzsicherheitsbewertungen, Gap-Analysen, physische Prüfungen, Quellcode-Reviews, Szenario-, Kompatibilitäts-, Performance-, End-to-End- und Penetrationstests | Testberichte je Testart, Maßnahmenverfolgung | Greenbone, Tenable; Snyk, SonarQube; k6/JMeter (Last); Pentest: SySS, usd, Cure53; Smart Contracts: Trail of Bits, ChainSecurity |
| Art. 26 + RTS 2025/1190 | TLPT alle 3 Jahre – nur für von der BaFin benannte Unternehmen (TIBER-DE) | Benennungsbescheid oder Negativnachweis; TLPT-Bericht, Attestierung | Threat-Intel- und Red-Team-Anbieter mit TIBER-Erfahrung (z. B. NVISO, Mandiant, Deloitte) |
| Art. 27 | Anforderungen an Tester (Zuverlässigkeit, Zertifizierung, Haftpflicht) | Tester-Qualifikationsnachweise | — |

### 2.4 Kapitel V – IKT-Drittparteienrisiko (Art. 28–44)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 28 Abs. 1–2 | Strategie und Richtlinie für IKT-Drittparteienrisiko, jährliche GL-Überprüfung | Drittparteien-Strategie, Richtlinie nach RTS 2024/1773 | GRC-/TPRM-Tool: Vanta, Drata · OneTrust TPRM, Mitratech Prevalent, Panorays |
| Art. 28 Abs. 3 + ITS 2024/2956 | Informationsregister aller IKT-Verträge; jährliche Einreichung (2026: Stichtag 31.12.2025, Fenster 9.–30.03.2026) als xBRL-CSV oder BaFin-Excel-Vorlage (advisori) | Register, Validierungsprotokoll, MVP-Eingangsbestätigung | BaFin-Excel-Vorlage (kostenlos) · Regnology, Horn & Company Register-Tool, mgm tp, ServiceNow; EBA-Validierungsregeln |
| Art. 28 Abs. 3 UA 3 | Behörde vorab über geplante Verträge zu kritischen/wichtigen Funktionen informieren | Anzeigen, MVP-Belege | BaFin-MVP |
| Art. 28 Abs. 4–6 | Due Diligence vor Vertragsschluss, Konflikte, Prüfung von Zertifikaten | Due-Diligence-Berichte, SOC-2-/ISAE-3402-/C5-Testate | TPRM-Tool; Ratings: SecurityScorecard, BitSight |
| Art. 28 Abs. 7–8 | Kündigungsrechte, Exit-Strategien und getestete Ausstiegspläne für kritische Funktionen | Exit-Pläne je kritischem Dienstleister | — |
| Art. 29 | Konzentrationsrisiko bewerten | Konzentrationsanalyse | TPRM-Tool |
| Art. 30 | Pflichtvertragsinhalte (Leistungsbeschreibung, Orte, Datenschutz, Prüf- und Zugangsrechte, Vorfallunterstützung, Kündigung, bei kritischen Funktionen zusätzlich SLAs, Exit, TLPT-Teilnahme) | Vertragsklausel-Checkliste, Vertrags-Addendum | DORA-Addenda der Hyperscaler (AWS, Microsoft, Google); Vertragsmanagement: Juro, Docusign CLM |
| RTS 2025/532 | Unterauftragsvergabe bei kritischen Funktionen | Subcontractor-Kette im Register | TPRM-Tool |
| Art. 31–44 | Überwachung kritischer IKT-Drittdienstleister (CTPP) durch ESAs | Abgleich der Dienstleister mit der ESA-CTPP-Liste | — |

### 2.5 Kapitel VI – Informationsaustausch (Art. 45)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 45 | Freiwilliger Austausch von Cyber-Bedrohungsinformationen; Teilnahme der Behörde mitteilen | Teilnahmevereinbarung, Anzeige | FS-ISAC, Allianz für Cybersicherheit; MISP (Open Source) |

## 3. NIS2 – Richtlinie (EU) 2022/2555 / BSIG (NIS2UmsuCG, in Kraft seit Dezember 2025)

Für DORA-Finanzunternehmen gelten die BSIG-Pflichten §§ 30, 31, 32, 35, 36, 38 und 39 nicht (§ 28 Abs. 6 Nr. 1 BSIG); übrig bleibt im Kern die Registrierung nach § 33 BSIG (legiscope, SECJUR). Zuerst ist die Betroffenheit zu prüfen: NIS2-Anhang I nennt im Finanzbereich Kreditinstitute und Finanzmarktinfrastrukturen; ein reines Zahlungs-/Krypto-Institut kann ganz außerhalb liegen. Mit späterer Banklizenz ändert sich das.

| Passage (NIS2 / BSIG) | Anforderung | Gilt für DORA-Institut? | Nachweis | Produkte |
|---|---|---|---|---|
| Art. 2–3 NIS2 / § 28 BSIG | Einstufung als wichtige oder besonders wichtige Einrichtung (Sektor, Größe) | Ja – Prüfung | Betroffenheitsanalyse | BSI-Betroffenheitsprüfung (online, kostenlos) |
| Art. 4 NIS2 / § 28 Abs. 6 BSIG | Lex specialis DORA | Ja | Dokumentierte Ausnahmebegründung | — |
| Art. 20 NIS2 / § 38 BSIG | Billigung, Überwachung, Schulung der Geschäftsleitung | Nein (DORA Art. 5 deckt ab) | — | — |
| Art. 21 NIS2 / §§ 30–31 BSIG | Risikomanagementmaßnahmen (10 Mindestmaßnahmen) | Nein (DORA Kap. II) | Mapping-Tabelle NIS2 → DORA für Prüfer | GRC-Tool-Mapping |
| Art. 23 NIS2 / § 32 BSIG | Meldung 24 h / 72 h / 1 Monat an BSI | Nein (DORA Art. 19) | — | — |
| Art. 27 NIS2 / § 33 BSIG | Registrierung beim BSI binnen 3 Monaten nach Betroffenheit, Angaben aktuell halten, Erreichbarkeit | Ja, falls betroffen | Registrierungsbestätigung, Änderungsmeldungen | BSI-Portal; Zugang per ELSTER-Organisationszertifikat (advisori) |
| § 34 BSIG | Besondere Registrierung bestimmter Digitalanbieter | Nur wenn zusätzlich Digitalanbieter | — | — |
| Art. 29 NIS2 | Freiwilliger Informationsaustausch | Freiwillig | — | Allianz für Cybersicherheit, MISP |
| Anlage 1 BSIG (z. B. Cloud, Managed Services) | Volle BSIG-Pflichten für Nicht-Finanz-Tätigkeiten | Ja, wenn das Unternehmen anderen IKT-Dienste anbietet (z. B. White-Label-Plattform für Nicht-EU-Anbieter) | Eigenes BSIG-Programm | wie ISO 27001-Abschnitt |

**Folge für die Planung:** Eine Plattform, die Nicht-EU-Zahlungsanbietern als Managed Service angeboten wird, kann eine eigene NIS2-Einrichtung sein. Das sollte vor dem Produktdesign geprüft werden.

## 4. MaRisk, ZAG-MaRisk und BAIT

Für ein Zahlungsinstitut gelten die ZAG-MaRisk (BaFin-Rundschreiben 07/2024, Grundlage § 27 ZAG), nicht die Bank-MaRisk. Sie sind wie die MaRisk in AT und BT gegliedert, aber schlanker (z. B. jährlicher statt quartalsweiser Risikobericht) (paytechlaw). BAIT und ZAIT spielen für ein DORA-Institut keine Rolle mehr; IT-Anforderungen kommen aus DORA. Die Bank-MaRisk werden erst mit einer KWG-Lizenz relevant.

### 4.1 ZAG-MaRisk – Allgemeiner Teil (AT)

| Modul | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| AT 1–2 | Proportionalität, Anwendungsbereich | Anwendbarkeitsanalyse | — |
| AT 3 | Gesamtverantwortung der Geschäftsleitung | Geschäftsverteilungsplan | — |
| AT 4.1 | Risikotragfähigkeit (Kapital und Liquidität) | Risikotragfähigkeitskonzept, Berechnung | Excel/Python-Modell · msg GillardonBSM, avedos risk2value |
| AT 4.2 | Geschäfts- und Risikostrategie, inkl. ESG | Strategiedokumente, jährliche Überprüfung | — |
| AT 4.3.1 | Aufbau- und Ablauforganisation, Funktionstrennung | Organigramm, Kompetenzordnung | — |
| AT 4.3.2 | Risikosteuerungs- und -controllingprozesse | Risikoinventur, Risikohandbuch | avedos risk2value, HiScout GRC, OneTrust GRC |
| AT 4.4.1 | Risikocontrolling-Funktion | Bestellung, Funktionsbeschreibung | — |
| AT 4.4.2 | Compliance-Funktion (Pflicht; volle Auslagerung nur bei geringer Komplexität) (Ebner Stolz) | Compliance-Charta, Rechtsmonitoring, Compliance-Plan | Regulatorisches Monitoring: PwC Plus, FIS-Rechtskataster, Haufe |
| AT 4.4.3 | Interne Revision | Revisionsordnung, Prüfungsplan | Audimex, TeamMate+; ausgelagerte Revision |
| AT 5 | Organisationsrichtlinien | Schriftlich fixierte Ordnung (SFO) | Confluence · Dokumentenmanagement mit Freigabe-Workflow |
| AT 6 | Dokumentation | Aufbewahrungskonzept | Revisionssicheres Archiv |
| AT 7.1 | Personal: Quantität und Qualifikation | Stellenplan, Qualifikationsnachweise | Personio |
| AT 7.2 | Technisch-organisatorische Ausstattung | Verweis auf DORA-Rahmenwerk | siehe DORA |
| AT 7.3 | Notfallmanagement | Verweis auf DORA Art. 11–12 | siehe DORA |
| AT 8 | Anpassungsprozesse, Neue-Produkte-Prozess (NPP) | NPP-Richtlinie, Freigabeprotokolle | Jira-Workflow |
| AT 9 | Auslagerung (§ 26 ZAG): Risikoanalyse, wesentliche Auslagerungen, Anzeige, Auslagerungsbeauftragter | Auslagerungsregister, Risikoanalysen, BaFin-Anzeigen | TPRM-Tool (siehe DORA Art. 28); BaFin-MVP |

### 4.2 ZAG-MaRisk – Besonderer Teil (BT)

| Modul | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| BTO 1 | Sicherung der Kundengelder (§§ 17–18 ZAG): Treuhandvertrag, Eingänge direkt aufs Treuhandkonto, keine Eigenmittel darauf, Abstimmung außerhalb des Betriebsbereichs | Treuhandvertrag, tägliche Reconciliation-Nachweise | Treuhandkonto bei CRR-Kreditinstitut (Beispiele: Banking Circle, Varengold, Commerzbank – Verfügbarkeit prüfen); Reconciliation: Kyriba, Fragment, eigene Ledger-Logik |
| BTO 2 | Betrugsprävention, Sicherheitsvorfälle, sicherheitsrelevante Kundenbeschwerden, Kontaktstelle für Kunden | Fraud-Konzept, Beschwerderegister | Fraud: SEON, Sardine, Featurespace, Feedzai; Ticketing: Zendesk, Freshdesk |
| BTO 3 | Einsatz von Agenten (§ 25 ZAG) | Agentenverträge, Kontrollnachweise | — |
| BTR 1 | Operationelle Risiken (wichtigste Risikoart) | Schadensfalldatenbank, Risk-Self-Assessments | avedos risk2value, OneTrust |
| BTR 2 | Adressenausfallrisiken: Limite, Konzentrationen | Limitsystem | Treasury-Tool, Excel-Modell |
| BTR 3 | Marktpreisrisiken (inkl. Krypto-/Stablecoin-Bestände) begrenzen und überwachen | Limitüberwachung | Krypto-Treasury: Fireblocks, Copper; Preisfeeds: Kaiko, CoinMetrics |
| BTR 4 | Liquiditätsrisiken, mehrjähriger Finanzierungsplan | Liquiditätsplanung | Agicap, Kyriba |
| BT 2 | Interne Revision (wie MaRisk, Jahresbericht genügt) | Revisionsberichte, Findings-Tracking | Audimex, TeamMate+ |
| BT 3 | Risikoberichterstattung (jährlich regulär, ad hoc bei Bedarf) | Risikobericht an GL und Aufsichtsorgan | Power BI, GRC-Reporting |

### 4.3 BAIT / ZAIT – Status

| Rundschreiben | Status | Folge |
|---|---|---|
| ZAIT | Aufgehoben mit Ablauf 16.01.2025 | Keine Anwendung |
| BAIT | Für DORA-pflichtige Institute seit 17.01.2025 nicht anwendbar; vollständige Aufhebung mit Ablauf 31.12.2026 (Bundesbank) | Keine eigenen BAIT-Nachweise anlegen; BaFin-Aufsichtsmitteilung „Hinweise zur Umsetzung von DORA" als Mapping-Hilfe nutzen |
| EBA/GL/2025/02 | Leitlinien zu IKT- und Sicherheitsrisiken für PSD2-Aspekte außerhalb DORA (paytechlaw-Übersicht) | Ergänzend zu DORA beachten |

## 5. MiCAR – Verordnung (EU) 2023/1114 (mit KMAG)

Ein Zahlungsinstitut steht nicht auf der Liste des Art. 60 MiCAR und braucht daher eine volle CASP-Zulassung nach Art. 59/62. Die deutsche Übergangsfrist endete am 30.12.2025 (finanzwissen). Umgekehrt gilt: CASPs, die EMT-Transfers für Kunden ausführen, brauchen seit 02.03.2026 zusätzlich eine PSD2-Erlaubnis oder einen lizenzierten Partner (EBA). Die Kombination ZAG + CASP ist damit für ein Stablecoin-Zahlungsmodell die passende Struktur.

### 5.1 Titel V – Pflichten der Kryptowerte-Dienstleister (Art. 59–85)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 59 | Zulassungspflicht, Sitz und Leitung in der EU | Zulassungsbescheid | — |
| Art. 60 | Notifizierungsweg nur für CRR-Institute, E-Geld-Institute (eingeschränkt), Wertpapierfirmen u. a. – nicht für Zahlungsinstitute | Abgrenzungsvermerk | — |
| Art. 62–63 | Zulassungsantrag: Geschäftsplan, Governance, Fit & Proper, IKT-Beschreibung, AML-Verfahren, Verwahrungs-, Beschwerde-, Interessenkonfliktrichtlinien | Vollständiges Antragsdossier nach ESMA-RTS/ITS | Fachanwaltskanzleien für Antragsdossier; Projektsteuerung in Jira |
| Art. 65 | Grenzüberschreitende Erbringung (Passporting) | Notifizierung je Mitgliedstaat | — |
| Art. 66 Abs. 1–4 | Ehrlich, redlich, professionell handeln; faire, klare Informationen und Risikohinweise | Marketing-Freigabeprozess, Risikohinweise | — |
| Art. 66 Abs. 5 | Nachhaltigkeitsindikatoren (Klima/Umwelt) der Konsensmechanismen auf Website veröffentlichen | Offenlegungsseite, Datenquelle | CCRI (Crypto Carbon Ratings Institute) MiCA-Daten |
| Art. 67 + Anhang IV | Aufsichtsrechtliche Sicherheitsvorkehrungen: Mindestkapital 50.000 / 125.000 / 150.000 € je Dienstklasse oder ¼ der fixen Gemeinkosten (der höhere Wert) | Kapitalberechnung, Versicherungspolice falls genutzt | Treasury-Modell; Versicherer für Krypto-Policen (z. B. Lloyd's-Syndikate über Spezialmakler) |
| Art. 68 | Governance: Fit & Proper der Leitung und Anteilseigner, Richtlinien und Verfahren, Geschäftsfortführung, IKT nach DORA, Aufzeichnungen aller Dienste und Aufträge | Fit-&-Proper-Unterlagen, Richtlinienhandbuch, Aufzeichnungssystem | Revisionssichere Transaktionsdatenhaltung (PostgreSQL + WORM-Archiv); GRC-Tool |
| Art. 69 | Änderungen in der Leitung an Behörde melden | Anzeigen | BaFin-MVP |
| Art. 70 | Schutz von Kundenkryptowerten und -geldern: Trennung, Gelder bis Ende des Folgetags bei Kreditinstitut/Zentralbank, keine Eigennutzung | Segregationskonzept, Kontennachweise, Abstimmungen | Omnibus-/Einzel-Wallets in Custody-Plattform; Treuhandkonto (siehe ZAG-MaRisk BTO 1) |
| Art. 71 | Beschwerdeverfahren: kostenlos, veröffentlicht, Register, Fristen | Beschwerderichtlinie, Register | Zendesk, Freshdesk mit Beschwerde-Workflow |
| Art. 72 | Interessenkonflikte erkennen, verhindern, offenlegen | Interessenkonfliktrichtlinie, Konfliktregister | GRC-Tool; Mitarbeitergeschäfte: StarCompliance, MCO |
| Art. 73 | Auslagerung: keine Delegation von Verantwortung, Vertrag, Prüfrechte | Auslagerungsverträge, Register (mit DORA verzahnt) | TPRM-Tool |
| Art. 74 | Plan für geordnete Abwicklung (Wind-down) | Abwicklungsplan | — |
| Art. 75 | Verwahrung und Verwaltung: Kundenvertrag, Verwahrrichtlinie, Kundenregister, Positionsauszüge, Segregation, Haftung bis Marktwert bei Verlust | Verwahrrichtlinie, Schlüsselzeremonie-Protokolle, Kontoauszüge | Custody-Technik: Fireblocks (MPC), Taurus, Ledger Enterprise, BitGo · Sub-Verwahrung bei deutschen Kryptoverwahrern: Tangany, Finoa |
| Art. 76 | Betrieb einer Handelsplattform (nur falls angeboten) | Handelsregelwerk | Matching-Engine (Eigenbau oder Wyden, Nasdaq Marketplace Tech) |
| Art. 77 | Tausch Kryptowerte ↔ Geld/Kryptowerte: nichtdiskriminierende Geschäftspolitik, Preise oder Methode veröffentlichen, Transaktionen offenlegen | Geschäftspolitik, Preisveröffentlichung | Liquiditäts-/OTC-Partner (z. B. B2C2, Flowdesk); Preisdaten: Kaiko, CoinMetrics |
| Art. 78 | Ausführung von Aufträgen: bestmögliches Ergebnis (Best Execution) | Best-Execution-Richtlinie, Monitoring | Smart-Order-Routing (z. B. Wyden, Talos) |
| Art. 79–80 | Platzierung; Annahme und Übermittlung von Aufträgen | Verfahrensbeschreibungen | — |
| Art. 81 | Beratung und Portfolioverwaltung: Geeignetheitsprüfung | Suitability-Fragebogen | — (nur falls angeboten) |
| Art. 82 | Transferdienstleistungen: Kundenvertrag mit Rechten, Pflichten, Gebühren, Fristen | Transfer-AGB | — |
| Art. 83–85 | Erwerb qualifizierter Beteiligungen anzeigen, Prüfung | Inhaberkontrollverfahren | — |

### 5.2 Titel II–IV – Token-Angebote und Stablecoin-Emission

| Passage | Anforderung | Relevanz | Nachweis / Produkte |
|---|---|---|---|
| Art. 4–15 (andere Kryptowerte) | Whitepaper, Marketingmitteilungen, Notifizierung, Widerrufsrecht, Haftung | Nur bei eigenem Token-Angebot oder Zulassung zum Handel | Whitepaper im iXBRL-Format für das ESMA-Register; Tools: Workiva, Arelle (Validierung) |
| Art. 16–47 (ART) | Zulassung, Reservevermögen, Verwahrung der Reserve, Sanierungs- und Rücktauschplan | Nur bei Emission vermögenswertreferenzierter Token | Reserveverwahrer, Stresstests |
| Art. 48–58 (EMT) | Emission nur durch Kreditinstitute oder E-Geld-Institute; Ausgabe zum Nennwert, jederzeitiger Rücktausch, Anlage der Gelder, Sanierungs-/Rücktauschplan | Eigener Euro-Stablecoin erfordert E-Geld-Lizenz; sonst Nutzung fremder EMTs | Zugelassene EMTs (z. B. Circle EURC, SG-FORGE EUR CoinVertible) – Emittentenzulassung im ESMA-Register prüfen |

### 5.3 Titel VI – Marktmissbrauch (Art. 86–92)

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 87–88 | Insiderinformationen, Ad-hoc-Offenlegung durch Emittenten | Insiderliste (falls Emittent) | — |
| Art. 89–91 | Verbot von Insidergeschäften, unrechtmäßiger Offenlegung, Marktmanipulation | Mitarbeiterleitlinie, Handelsverbote | StarCompliance |
| Art. 92 | Wer gewerbsmäßig Geschäfte vermittelt oder ausführt: Systeme zur Erkennung und Meldung verdächtiger Aufträge (STOR) an BaFin | Surveillance-Konzept, Alarmprotokolle, STOR-Meldungen | Solidus Labs, Eventus, b-next (DE), Nasdaq Trade Surveillance |

## 6. GwG, Geldtransferverordnung (TFR) und Ausblick AMLR

Bis 09.07.2027 gilt das GwG; ab 10.07.2027 gilt die EU-Geldwäscheverordnung (AMLR, VO 2024/1624) unmittelbar und verdrängt große Teile des GwG (nexvyra). Die TFR (VO 2023/1113) mit der Travel Rule für Krypto gilt seit 30.12.2024. Prozesse sollten jetzt schon AMLR-fähig gebaut werden.

### 6.1 GwG – paragraphenweise

| Paragraph | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| § 2 | Verpflichtetenstatus (u. a. Zahlungsinstitute, Kryptowerte-Dienstleister) | Statusfeststellung | — |
| § 4 | Risikomanagement; verantwortliches Mitglied der Leitung benennen | GL-Beschluss | — |
| § 5 | Unternehmensweite Risikoanalyse (Kunden, Produkte, Kanäle, Länder; Krypto-Spezifika wie Mixer, Privacy Coins, Self-hosted Wallets), jährlich aktualisieren | Risikoanalyse | Excel-Vorlage · Fenergo, Hawk AI-Risikomodule |
| § 6 | Interne Sicherungsmaßnahmen: Grundsätze, Zuverlässigkeitsprüfung der Mitarbeitenden, Schulungen, Hinweisgebersystem, Monitoring-Systeme | AML-Handbuch, Schulungsnachweise, Hinweisgeberkanal | Schulung: ACAMS, lawpilots; Hinweisgeber: EQS Integrity Line, LegalTegrity |
| § 7 | Geldwäschebeauftragter und Stellvertreter, Anzeige an BaFin | Bestellung, BaFin-Anzeige | — |
| § 8 | Aufzeichnung und Aufbewahrung (5 Jahre) | Archivkonzept | Revisionssicheres Archiv |
| § 9 | Gruppenweite Pflichten | Gruppenrichtlinie (bei Tochtergesellschaften) | — |
| § 10 | Allgemeine Sorgfaltspflichten: Identifizierung, wirtschaftlich Berechtigter, Zweck, PEP-Prüfung, kontinuierliche Überwachung | KYC/KYB-Arbeitsanweisung | CLM: Fenergo, Sumsub |
| §§ 11–13 | Identifizierung und Überprüfung; nur BaFin-konforme Verfahren (Video-Ident, eID, QES) | Ident-Protokolle | IDnow, WebID, Nect (DE); international: Sumsub, Veriff |
| § 11 + §§ 18 ff. | Transparenzregister-Einsicht bei Firmenkunden (Händler, Hotels), Unstimmigkeitsmeldung nach § 23a | Registerauszüge, Unstimmigkeitsmeldungen | Transparenzregister-Portal; KYB-Daten: North Data, Moody's Orbis/Kompany |
| § 14 | Vereinfachte Sorgfaltspflichten bei geringem Risiko | Begründung | — |
| § 15 | Verstärkte Sorgfaltspflichten (Hochrisikoländer, PEP, ungewöhnliche Transaktionen, Korrespondenzbeziehungen) | EDD-Akten | wie § 10 |
| § 17 | Ausführung durch Dritte / Auslagerung von KYC | Vertrag, Kontrollen | — |
| § 43 | Verdachtsmeldung an die FIU unverzüglich | SAR-Workflow, Meldebelege | goAML-Portal der FIU (Registrierung erforderlich); Fallmanagement: Hawk AI, Unit21 |
| § 46 | Transaktion erst nach Zustimmung oder Fristablauf (3 Werktage) ausführen | Stillhalte-Logik im System | Transaktionssperre im Core-System |
| § 47 | Verbot der Informationsweitergabe (Tipping-off) | Mitarbeiterweisung | — |
| § 27 Abs. 1 ZAG i. V. m. GwG | EDV-gestütztes Transaktionsmonitoring und Sanktionsscreening | Monitoring-Regelwerk, Treffer-Bearbeitung | Fiat: Hawk AI (DE), ComplyAdvantage, Feedzai; Sanktionen/PEP: ComplyAdvantage, LSEG World-Check, Dow Jones R&C |

### 6.2 TFR (VO 2023/1113) – Travel Rule

| Artikel | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| Art. 4–6 | Geldtransfers: Angaben zu Zahler und Zahlungsempfänger übermitteln | Zahlungsnachrichten-Konfiguration | Core-Banking/Payment-Hub mit SEPA-Feldern |
| Art. 7–9 | Fehlende Angaben erkennen, zurückweisen/aussetzen, wiederholte Verstöße melden | Prüfregeln, Meldungen | wie oben |
| Art. 14 Abs. 1–4 | Kryptowertetransfers: Originator- und Begünstigtendaten ohne Schwellenwert mitsenden, sicher übermitteln | Travel-Rule-Konzept, Protokoll-Logs | Notabene, Sumsub Travel Rule, 21 Analytics, Global Travel Rule (GTR), TRISA (Open Source), Veriscope |
| Art. 14 Abs. 5 | Transfers an selbst gehostete Adressen über 1.000 €: prüfen, ob die Adresse dem Kunden gehört bzw. von ihm kontrolliert wird | Ownership-Nachweise | Message Signing (z. B. SIWE/EIP-191), Satoshi-Test; Module bei Notabene, 21 Analytics |
| Art. 16–17 | Begünstigten-CASP: fehlende Angaben erkennen, Transfer zurückweisen/aussetzen, risikobasiert reagieren | Regelwerk, Fallakten | Travel-Rule-Tool + Blockchain-Analytics |
| Art. 18 | Verdachtsrelevanz fehlender Angaben bewerten | Fallbewertungen | — |
| Art. 19–21 | Pflichten zwischengeschalteter CASPs | Verfahrensbeschreibung | — |
| Art. 26 | Aufbewahrung 5 Jahre | Archiv | Revisionssicheres Archiv |
| EBA/GL/2024/11 | Travel-Rule-Leitlinien der EBA | Mapping | — |
| GwG/MiCAR Art. 68 | On-Chain-Risikoanalyse (Sanktionsadressen, Mixer, Darknet) | Analytics-Konfiguration, Risk-Score-Schwellen | Chainalysis KYT, Elliptic, TRM Labs, Crystal, Merkle Science |

### 6.3 AMLR ab 10.07.2027 – Vorbereitung

| Artikel | Neuerung | Vorbereitung jetzt |
|---|---|---|
| Art. 9–11 | Interne Richtlinien, unternehmensweite Risikobewertung, Compliance-Manager in der Leitung plus Compliance Officer | Rollenmodell anpassen |
| Art. 19–28 | Harmonisierte Sorgfaltspflichten; AMLA-RTS zu Art. 28 (KYC-Datenumfang) liegen final vor (paytechlaw) | KYC-Datenmodell auf RTS ausrichten |
| Art. 37 | Verstärkte Pflichten bei grenzüberschreitenden Krypto-Korrespondenzbeziehungen | Due Diligence für Nicht-EU-Partner-VASPs |
| Art. 40 | Risikominderung bei Transfers mit selbst gehosteten Adressen (lxgesetze) | Self-hosted-Wallet-Richtlinie erweitern |

## 7. ZAG / PSD2 inkl. RTS SCA

Das ZAG ist die Lizenzgrundlage des Zahlungsinstituts; IT- und Vorfallthemen sind seit 2025 weitgehend auf DORA verlagert (§ 53 Abs. 1 S. 3, § 54 Abs. 7 ZAG). Eigenständig bleiben vor allem Erlaubnis, Kapital, Kundengeldsicherung, Organisation, der jährliche Risikobericht nach § 53 Abs. 2 und die starke Kundenauthentifizierung.

### 7.1 ZAG – paragraphenweise

| Paragraph | Anforderung | Nachweis | Produkte |
|---|---|---|---|
| § 1 Abs. 1 S. 2 | Einordnung der Zahlungsdienste (z. B. Nr. 5 Akquisitionsgeschäft für Händler, Nr. 6 Finanztransfer) | Dienste-Mapping | — |
| § 2 | Ausnahmen prüfen (z. B. begrenzte Netze) | Abgrenzungsvermerk | — |
| § 10 | Erlaubnisantrag: Geschäftsplan, Budget 3 Jahre, Sicherungsmaßnahmen, Governance, Notfall- und Sicherheitskonzept, Verfahren für Vorfälle, Geschäftsleiter-Unterlagen | Antragsdossier | BaFin-Antragsformulare; spezialisierte Kanzleien |
| § 12 + PSD2 Art. 7 | Anfangskapital (für Akquisitionsgeschäft 125.000 €) | Kapitalnachweis | Eröffnungsbilanz, Bankbestätigung |
| § 14 | Inhaberkontrolle bei bedeutenden Beteiligungen | Anzeigen nach InhKontrollV | — |
| § 15 | Laufende Eigenmittel (Methode A/B/C) | Eigenmittelberechnung | Regnology, Excel-Modell |
| § 17 | Sicherung der Kundengelder (Treuhandkonto, Versicherung oder Garantie) | Treuhandvertrag, Abstimmungen | siehe ZAG-MaRisk BTO 1 |
| §§ 22–24 | Rechnungslegung, Jahresabschlussprüfung, besondere Prüferpflichten | Prüfungsbericht | Prüfer mit ZAG-Erfahrung |
| § 25 | Agenten | Agentenverträge, Anzeigen | — |
| § 26 | Auslagerung, Anzeige wesentlicher Auslagerungen | Auslagerungsregister | TPRM-Tool; BaFin-MVP |
| § 27 | Ordnungsgemäße Geschäftsorganisation: Risikomanagement, Notfallkonzept, Dokumentation, AML-Sicherungsmaßnahmen | ZAG-MaRisk-Umsetzung | siehe Abschnitt 4 |
| § 28 | Anzeigepflichten (Geschäftsleiter, Beteiligungen, Änderungen) nach ZAGAnzV | Anzeigenregister | BaFin-MVP |
| § 29 | Monatsausweise und Meldungen | Meldebelege | Bundesbank-ExtraNet; Regnology |
| §§ 38–39 | Passporting in andere EU-Staaten | Notifizierungen | — |
| § 46 | Zugang zu Zahlungssystemen | Teilnahmeverträge | Indirekter Zugang über Sponsorbank (z. B. Banking Circle); Payment-Hub: Form3, Volante |
| §§ 48–52 | Pflichten bei Zahlungsauslöse- und Kontoinformationsdiensten (nur falls angeboten oder als kontoführender ZDL) | Schnittstellen-Dokumentation | Open-Banking-APIs: finAPI, Tink |
| § 53 Abs. 1 | Risikominderung und Kontrollen für operationelle und Sicherheitsrisiken (unbeschadet DORA Kap. II) | Verweis auf DORA-Rahmenwerk | siehe DORA |
| § 53 Abs. 2 + RS 05/2024 | Jährliche umfassende Bewertung der operationellen und Sicherheitsrisiken an die BaFin (gesetze-im-internet) | Jahresbericht nach BaFin-Vorlage | GRC-Reporting |
| § 54 | Vorfallmeldung – für Zahlungsinstitute über DORA Art. 19/23 | siehe DORA | BaFin-MVP |
| § 55 + RTS (EU) 2018/389 | Starke Kundenauthentifizierung (2 von 3 Faktoren, dynamische Verknüpfung, Ausnahmen) | SCA-Konzept, Ausnahmeregister | Nevis, Netcetera (3-D Secure), Transmit Security, iProov |
| RTS 2018/389 Art. 2 | Transaktionsüberwachung zur Betrugserkennung | Regelwerk | SEON, Sardine, Featurespace, Feedzai |
| RTS 2018/389 Art. 3 | Prüfung der Sicherheitsmaßnahmen; bei TRA-Ausnahme Prüfung der Methodik | Prüfberichte | Externe Prüfer |
| RTS 2018/389 Art. 18–21 | Transaktionsrisikoanalyse (TRA): Betrugsraten je Schwellenwert, vierteljährliche Überwachung, Meldung bei Überschreitung | Betrugsquoten-Reports | Fraud-Plattform mit TRA-Reporting |
| EBA-Leitlinien Betrugsmeldung | Halbjährliche Betrugsstatistik an die Bundesbank | Meldebelege | Bundesbank-ExtraNet |
| § 62 | Beschwerdeverfahren, Antwort grundsätzlich binnen 15 Geschäftstagen | Beschwerderegister | Zendesk, Freshdesk |
| §§ 675c ff. BGB, Art. 248 EGBGB | Zivilrechtliche Informations- und Haftungspflichten (z. B. Erstattung unautorisierter Zahlungen) | AGB, Preis- und Leistungsverzeichnis | Rechtsprüfung |

### 7.2 Ausblick

| Thema | Stand | Folge |
|---|---|---|
| EU-Verordnung Echtzeitüberweisungen (VO 2024/886) | Pflichten für Zahlungs- und E-Geld-Institute zu Empfang, Versand und Empfängerüberprüfung (VoP) mit Fristen in 2027 – genaue Daten vor Produktstart prüfen | VoP- und Instant-Fähigkeit im Payment-Hub einplanen |
| PSD3 / Payment Services Regulation (PSR) | Neues EU-Paket, das PSD2 ablösen soll; Anwendungsbeginn nach Inkrafttreten mit Übergangsfrist – Stand vor Lizenzantrag prüfen | Erlaubnis kann Neuzulassung oder Übergangsantrag erfordern |
| MiCAR-Überarbeitung | Diskussion über Folgefassung läuft (paytechlaw) | Horizon Scanning |

## 8. Produkt- und Tool-Landkarte

Rund 20 Werkzeugkategorien decken alle sieben Regelwerke ab; das GRC-Tool ist der Kern, weil es Nachweise für ISO 27001, DORA, ZAG-MaRisk und MiCAR Art. 68 an einer Stelle bündelt. Alle Anbieter sind Marktbeispiele; vor Vertragsschluss greift die Due Diligence nach DORA Art. 28.

| Kategorie | Deckt ab | Start-up | Skalierung |
|---|---|---|---|
| GRC / ISMS | ISO 27001 Kl. 4–10, DORA Art. 5–6, ZAG-MaRisk AT 4, MiCAR Art. 68 | Secjur, Vanta, Drata, verinice | HiScout GRC, ServiceNow IRM, OneTrust, avedos risk2value |
| Drittparteien / Informationsregister | DORA Art. 28–30, ISO A.5.19–22, ZAG § 26, MiCAR Art. 73 | BaFin-Excel-Vorlage + GRC-Modul | OneTrust TPRM, Mitratech Prevalent, Regnology, Horn & Company Tool |
| Identität & Zugriff | ISO A.5.15–18, A.8.2–5, DORA Art. 9 | Microsoft Entra ID, Okta, YubiKey, Teleport | SailPoint, CyberArk, BeyondTrust |
| Endpunkt & MDM | ISO A.8.1, A.8.7 | Microsoft Intune + Defender for Endpoint | CrowdStrike Falcon, SentinelOne |
| SIEM / SOC | ISO A.8.15–16, DORA Art. 10 | Wazuh, Elastic, MDR-Dienst | Microsoft Sentinel, Splunk, Telekom MDR |
| Schwachstellen & Code | ISO A.8.8, A.8.25–29, DORA Art. 25 | Greenbone, Trivy, Semgrep, OWASP ZAP | Tenable, Qualys, GitHub Advanced Security, Snyk |
| Kryptografie & Schlüssel | ISO A.8.24, DORA Art. 9, MiCAR Art. 75 | AWS CloudHSM / KMS, HashiCorp Vault | Utimaco, Thales Luna |
| Krypto-Verwahrung | MiCAR Art. 70, 75 | Fireblocks, Sub-Verwahrung bei Tangany oder Finoa | Taurus, Ledger Enterprise, BitGo |
| Backup & BCM | ISO A.5.29–30, A.8.13–14, DORA Art. 11–12, ZAG-MaRisk AT 7.3 | Veeam, S3 Object Lock, F24 | Rubrik, HiScout BCM, Fusion |
| Vorfallmanagement & Meldewesen | ISO A.5.24–28, DORA Art. 17–23 | Jira Service Management, PagerDuty, BaFin-MVP | ServiceNow SecOps, Regnology |
| Awareness & Schulung | ISO A.6.3, DORA Art. 5 Abs. 4 und 13, GwG § 6 | SoSafe, KnowBe4, lawpilots | dieselben + ACAMS-Zertifizierungen |
| KYC / Ident | GwG §§ 10–13 | IDnow, WebID, Nect, Sumsub | Fenergo (CLM) |
| Sanktions- & PEP-Screening | GwG § 10, EU-Sanktionsrecht | ComplyAdvantage | LSEG World-Check, Dow Jones R&C |
| Transaktionsmonitoring Fiat | GwG § 6, § 27 ZAG | Hawk AI, ComplyAdvantage | Feedzai, Napier |
| Blockchain-Analytics | GwG, MiCAR Art. 68, TFR | Chainalysis KYT, Elliptic, TRM Labs | dieselben im Enterprise-Paket |
| Travel Rule | TFR Art. 14–21 | Notabene, Sumsub Travel Rule, TRISA | 21 Analytics (self-hosted), GTR |
| Betrugsprävention & SCA | ZAG § 55, RTS 2018/389, ZAG-MaRisk BTO 2 | SEON, Sardine, Netcetera 3DS | Featurespace, Nevis, Transmit Security |
| Marktmissbrauch | MiCAR Art. 92 | Solidus Labs | Eventus, b-next, Nasdaq Trade Surveillance |
| Beschwerden | MiCAR Art. 71, ZAG § 62, ZAG-MaRisk BTO 2 | Zendesk, Freshdesk | Salesforce Service Cloud |
| Hinweisgeber | GwG § 6, HinSchG | EQS Integrity Line | dieselben |
| Revision | ISO 9.2, DORA Art. 6, ZAG-MaRisk BT 2 | ausgelagerte Revision | Audimex, TeamMate+ |

## Quellen

- Bundesbank – BAIT / DORA
- KPMG – DORA kommt: Aufhebung der xAIT
- KPMG – NIS-2 für Finanzunternehmen
- legiscope – DORA und NIS2 abgrenzen
- SECJUR – NIS2 und DORA in der Finanzbranche
- advisori – Regulierungswelle 2026
- regulation-dora.eu – DORA-Vorfallmeldung
- dr-datenschutz – DORA-Vorfallmeldewesen
- springlex – DORA Art. 23
- advisori – DORA-Informationsregister 2026
- gesetze-im-internet – § 53 ZAG
- paytechlaw – ZAG-MaRisk Glossar
- paytechlaw – ZAG-MaRisk Besonderer Teil
- paytechlaw – Rechtsquellen für Zahlungsdienstleister im IT-Aufsichtsrecht
- Ebner Stolz – ZAG-MaRisk
- finanzwissen – MiCAR und Übergangsfrist Deutschland
- EBA – Ende der No-Action-Übergangsfrist PSD2/MiCA
- nexvyra – AMLR 2024/1624
- lxgesetze – AMLR Art. 40
- paytechlaw – Finale RTS zu Art. 28 AMLR
- paytechlaw – Nächste MiCA-Fassung
