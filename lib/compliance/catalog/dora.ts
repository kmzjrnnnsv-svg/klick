import type { CatalogRequirement, CatalogSection } from "./types";

// DORA – Verordnung (EU) 2022/2554. Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 2 (Tabellen 2.1–2.5).
// Rechtsstand Oktober 2026. Paraphrasen des Verordnungstexts, kein Rechtsrat.

export const DORA_SECTIONS: CatalogSection[] = [
	{
		code: "II",
		title: "Kapitel II – IKT-Risikomanagement (Art. 5–16)",
		sortOrder: 10,
	},
	{
		code: "III",
		title: "Kapitel III – IKT-Vorfälle (Art. 17–23)",
		sortOrder: 20,
	},
	{
		code: "IV",
		title:
			"Kapitel IV – Testen der digitalen operationalen Resilienz (Art. 24–27)",
		sortOrder: 30,
	},
	{
		code: "V",
		title: "Kapitel V – IKT-Drittparteienrisiko (Art. 28–44)",
		sortOrder: 40,
	},
	{
		code: "VI",
		title: "Kapitel VI – Informationsaustausch (Art. 45)",
		sortOrder: 50,
	},
];

export const DORA_REQUIREMENTS: CatalogRequirement[] = [
	// ───────────────────────── Kapitel II – IKT-Risikomanagement ─────────────────────────
	{
		code: "Art.5(2)",
		sectionCode: "II",
		title: "Endverantwortung des Leitungsorgans",
		requirementText:
			"Das Leitungsorgan definiert, genehmigt, überwacht und verantwortet den IKT-Risikomanagementrahmen. Es genehmigt Rollen und Zuständigkeiten, das IKT-Budget, die Richtlinie zur Nutzung von IKT-Drittdienstleistern sowie Geschäftsfortführungs- und Wiederanlaufpläne und legt klare Verantwortlichkeiten für alle IKT-Funktionen fest.",
		guidance:
			"Ein jährlicher Geschäftsleitungsbeschluss, der Rahmenwerk, Rollenmatrix, IKT-Budget und die Drittparteien-Richtlinie in einem Dokumentenpaket freigibt, deckt den Nachweis effizient ab.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["GL-Beschlüsse", "Geschäftsordnung", "IKT-Budget-Nachweis"],
		relatedRequirements: ["iso27001:5.1", "iso27001:5.3", "nis2:Art.20(1)"],
		recommendations: [
			{
				level: "must",
				text: "Freigabe des IKT-Risikomanagementrahmens als protokollierten GL-Beschluss mit Datum und Version dokumentieren.",
				source: "intern",
			},
			{
				level: "should",
				text: "IKT-Risiko als festen Tagesordnungspunkt in jede GL-Sitzung aufnehmen (Kennzahlen, Vorfälle, Drittparteien).",
				source: "EBA GL",
				ref: "EBA/GL/2019/04",
			},
		],
		auditQuestions: [
			"Wann hat die Geschäftsleitung den IKT-Risikomanagementrahmen zuletzt genehmigt?",
			"Ist das IKT-Budget als eigener Posten beschlossen und nachweisbar?",
		],
		pitfalls: [
			"Rahmenwerk nur vom ISB freigegeben, nicht vom Leitungsorgan – die Endverantwortung ist nicht delegierbar.",
		],
		tools: {
			startup: ["Vanta", "Drata", "Secjur", "ISMS.online"],
			scale: ["HiScout DORA", "ServiceNow IRM", "OneTrust", "Archer"],
		},
		sortOrder: 10,
	},
	{
		code: "Art.5(3)",
		sectionCode: "II",
		title: "Rolle zur Überwachung der IKT-Drittanbieter-Vereinbarungen",
		requirementText:
			"Das Finanzunternehmen richtet eine Rolle ein, die die Vereinbarungen mit IKT-Drittdienstleistern über die Nutzung von IKT-Dienstleistungen überwacht, oder benennt ein Mitglied der Geschäftsleitung als Verantwortlichen für das damit verbundene Risiko und die Dokumentation.",
		guidance:
			"Im kleinen Institut übernimmt typischerweise der Auslagerungsbeauftragte oder ein GL-Mitglied die Rolle; ein Ernennungsschreiben mit Aufgabenbeschreibung genügt.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Ernennungsschreiben"],
		relatedRequirements: ["iso27001:5.3", "iso27001:A.5.19"],
		recommendations: [
			{
				level: "must",
				text: "Rolle schriftlich benennen, inkl. Berichtslinie an die Geschäftsleitung und Vertretungsregelung.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wer überwacht die IKT-Drittanbieter-Vereinbarungen und wo ist die Benennung dokumentiert?",
		],
		sortOrder: 20,
	},
	{
		code: "Art.5(4)",
		sectionCode: "II",
		title: "IKT-Schulung des Leitungsorgans",
		requirementText:
			"Die Mitglieder des Leitungsorgans halten ausreichende Kenntnisse und Fähigkeiten aktiv auf dem neuesten Stand, um IKT-Risiken und deren Auswirkungen auf den Geschäftsbetrieb zu verstehen und zu bewerten, unter anderem durch regelmäßige spezifische Schulungen.",
		guidance:
			"Mindestens eine dokumentierte IKT-Risiko-Schulung pro Jahr und GL-Mitglied, mit Agenda, Dauer und Teilnahmebestätigung.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Schulungsnachweise GL"],
		relatedRequirements: ["nis2:Art.20(2)", "iso27001:7.3", "iso27001:7.2"],
		recommendations: [
			{
				level: "must",
				text: "Jährliche IKT-Risiko-Schulung aller GL-Mitglieder mit Teilnahmenachweis dokumentieren.",
				source: "intern",
			},
			{
				level: "could",
				text: "Externe Executive-Trainings mit DORA-Fokus nutzen, um Unabhängigkeit des Inhalts zu belegen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche IKT-Schulungen hat die Geschäftsleitung in den letzten zwölf Monaten absolviert?",
		],
		pitfalls: [
			"Allgemeine Awareness-Schulung der Belegschaft als GL-Schulung angerechnet – Inhalt muss auf Leitungsaufgaben zugeschnitten sein.",
		],
		tools: {
			startup: [
				"Frankfurt School Executive Education",
				"SoSafe (Management-Modul)",
			],
			scale: [],
		},
		sortOrder: 30,
	},
	{
		code: "Art.6(1-4)",
		sectionCode: "II",
		title: "Dokumentierter IKT-Risikomanagementrahmen",
		requirementText:
			"Das Finanzunternehmen verfügt über einen soliden, umfassenden und gut dokumentierten IKT-Risikomanagementrahmen mit Strategien, Leitlinien, Verfahren, Protokollen und Tools zum Schutz aller Informations- und IKT-Assets. Die Verantwortung für IKT-Risiko liegt bei einer unabhängigen Kontrollfunktion; Interessenkonflikte werden nach dem Modell der drei Verteidigungslinien vermieden.",
		guidance:
			"Für ein kleines Institut reicht ein Rahmenwerk-Dokument plus Organigramm, das die zweite Linie (IKT-Risikocontrolling) und die dritte Linie (ausgelagerte Interne Revision) sichtbar trennt.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Rahmenwerk-Dokument", "Organigramm"],
		relatedRequirements: [
			"iso27001:4.4",
			"iso27001:6.1.2",
			"iso27001:A.5.2",
			"nis2:Art.21(1)",
		],
		recommendations: [
			{
				level: "must",
				text: "Rahmenwerk als gelenktes Dokument mit Versionsstand, Freigabe und Verweis auf alle untergeordneten Richtlinien führen.",
				source: "intern",
			},
			{
				level: "should",
				text: "Unabhängigkeit der IKT-Risikokontrollfunktion von IT-Betrieb und Entwicklung im Organigramm und in Stellenbeschreibungen festschreiben.",
				source: "EBA GL",
				ref: "EBA/GL/2019/04",
			},
		],
		auditQuestions: [
			"Wo ist der IKT-Risikomanagementrahmen dokumentiert und wer ist für seine Pflege verantwortlich?",
			"Wie ist die Unabhängigkeit der IKT-Risikokontrollfunktion vom IT-Betrieb sichergestellt?",
		],
		pitfalls: [
			"ISB und IT-Leitung in einer Person ohne kompensierende Kontrolle – verletzt die Trennung der Verteidigungslinien.",
		],
		tools: { startup: ["GRC-Tool"], scale: [] },
		sortOrder: 40,
	},
	{
		code: "Art.6(5)",
		sectionCode: "II",
		title: "Jährliche Überprüfung des Rahmens",
		requirementText:
			"Der IKT-Risikomanagementrahmen wird mindestens einmal jährlich sowie bei schwerwiegenden IKT-bezogenen Vorfällen und nach aufsichtlichen Anweisungen oder Feststellungen aus Tests und Prüfungen dokumentiert und überprüft. Er wird auf Grundlage der gewonnenen Erkenntnisse kontinuierlich verbessert; auf Anfrage wird der zuständigen Behörde ein Bericht übermittelt.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Review-Protokoll"],
		relatedRequirements: ["iso27001:9.3", "iso27001:10.1"],
		recommendations: [
			{
				level: "must",
				text: "Jahresreview des Rahmens als Protokoll mit Auslösern (Turnus, Vorfall, Prüfungsfeststellung) und abgeleiteten Maßnahmen dokumentieren.",
				source: "intern",
			},
			{
				level: "should",
				text: "Review mit der ISO-Managementbewertung zusammenlegen, um einen Nachweis für beide Rahmenwerke zu erhalten.",
				source: "ISO 27002",
			},
		],
		auditQuestions: [
			"Wann wurde der Rahmen zuletzt überprüft und welche Änderungen resultierten daraus?",
			"Wurde der Rahmen nach dem letzten schwerwiegenden Vorfall angepasst?",
		],
		pitfalls: [
			"Review nur turnusmäßig – die anlassbezogene Überprüfung nach schwerwiegenden Vorfällen wird vergessen.",
		],
		tools: { startup: ["GRC-Tool"], scale: [] },
		sortOrder: 50,
	},
	{
		code: "Art.6(6)",
		sectionCode: "II",
		title: "Prüfung durch die Interne Revision",
		requirementText:
			"Der IKT-Risikomanagementrahmen wird regelmäßig von IKT-Prüfern mit ausreichendem Wissen, Fähigkeiten und Fachkenntnis geprüft, die unabhängig sind. Häufigkeit und Schwerpunkt der Prüfungen richten sich nach dem IKT-Risiko; Feststellungen werden über ein formelles Follow-up-Verfahren zeitnah nachverfolgt.",
		guidance:
			"Kleine Institute lagern die Interne Revision typischerweise aus; der Revisionsplan muss IKT-Themen explizit und risikoorientiert enthalten.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Revisionsplan", "Prüfberichte"],
		relatedRequirements: ["iso27001:9.2", "iso27001:A.5.35"],
		recommendations: [
			{
				level: "must",
				text: "Mehrjahres-Revisionsplan mit IKT-Prüfungsfeldern und Nachverfolgung offener Feststellungen führen.",
				source: "intern",
			},
			{
				level: "should",
				text: "Prüferqualifikation (z. B. CISA) im Auslagerungsvertrag der Revision festschreiben.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche IKT-Prüfungen hat die Interne Revision in den letzten drei Jahren durchgeführt und wie wurden Feststellungen nachverfolgt?",
		],
		tools: {
			startup: ["Ausgelagerte Revision (BDO, Forvis Mazars, Big Four)"],
			scale: [],
		},
		sortOrder: 60,
	},
	{
		code: "Art.6(8)",
		sectionCode: "II",
		title: "Strategie für digitale operationale Resilienz",
		requirementText:
			"Der Rahmen enthält eine Strategie für die digitale operationale Resilienz, die festlegt, wie der Rahmen umgesetzt wird: Risikotoleranzschwelle für IKT-Risiko, klare Informationssicherheitsziele, IKT-Referenzarchitektur, Mechanismen zur Erkennung und Behandlung von Vorfällen, Kennzahlen zur Resilienz, Strategie zur Nutzung von Drittdienstleistern und ein Testplan.",
		guidance:
			"Ein kompaktes Strategiedokument (5–10 Seiten) mit Toleranzschwellen, Zielen, Zielarchitektur, KPI-Set und Verweisen auf Testprogramm und Drittparteien-Strategie genügt.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Resilienzstrategie"],
		relatedRequirements: ["iso27001:5.2", "iso27001:6.2", "iso27001:6.1.1"],
		recommendations: [
			{
				level: "must",
				text: "Risikotoleranzschwellen und messbare Resilienzziele mit Kennzahlen (z. B. Verfügbarkeit, MTTR, Patch-Latenz) festlegen und jährlich bewerten.",
				source: "intern",
			},
			{
				level: "could",
				text: "Strategie mit der ISO-Informationssicherheitspolitik und den ISMS-Zielen zusammenführen.",
				source: "ISO 27002",
			},
		],
		auditQuestions: [
			"Welche Risikotoleranzschwellen für IKT-Risiko hat das Leitungsorgan festgelegt und wie werden sie gemessen?",
		],
		sortOrder: 70,
	},
	{
		code: "Art.7",
		sectionCode: "II",
		title: "Angemessene und resiliente IKT-Systeme",
		requirementText:
			"Das Finanzunternehmen verwendet und unterhält stets aktuelle IKT-Systeme, -Protokolle und -Tools, die dem Umfang der Geschäftstätigkeit angemessen, zuverlässig, ausreichend kapazitätsstark für Spitzenlasten und technisch resilient sind, einschließlich unter angespannten Marktbedingungen oder widrigen Umständen.",
		guidance:
			"Monitoring-Dashboards mit Kapazitäts- und Verfügbarkeitsmetriken plus ein jährlicher Architektur-Review (z. B. Cloud Well-Architected) belegen Angemessenheit und Kapazität.",
		domain: "operations",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Architektur- und Kapazitätsnachweise"],
		relatedRequirements: [
			"iso27001:A.8.6",
			"iso27001:A.8.14",
			"nis2:Art.21(2)(e)",
		],
		recommendations: [
			{
				level: "must",
				text: "Kapazitätsmonitoring mit Schwellenwerten und Alarmen für alle produktiven Systeme betreiben.",
				source: "ISO 27002",
				ref: "A.8.6",
			},
			{
				level: "should",
				text: "Lasttests vor größeren Releases und bei erwarteten Volumensprüngen (neue Händler, Kampagnen) durchführen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie wird nachgewiesen, dass die IKT-Systeme Spitzenlasten bewältigen?",
		],
		tools: {
			startup: ["Datadog", "Grafana", "Cloud-Well-Architected-Reviews"],
			scale: [],
		},
		sortOrder: 80,
	},
	{
		code: "Art.8(1-4)",
		sectionCode: "II",
		title: "Identifizierung von Funktionen, Rollen und Assets",
		requirementText:
			"Das Finanzunternehmen identifiziert, klassifiziert und dokumentiert alle IKT-gestützten Geschäftsfunktionen, Rollen und Verantwortlichkeiten, die sie unterstützenden Informations- und IKT-Assets sowie deren Rollen und Abhängigkeiten im Hinblick auf IKT-Risiko. Die Angemessenheit der Klassifizierung wird regelmäßig, mindestens jährlich, überprüft; Quellen von IKT-Risiko werden laufend identifiziert.",
		guidance:
			"Ein Asset-Inventar mit Verknüpfung zu Geschäftsprozessen und Kritikalitätsstufe ist das Minimum; Netzpläne und Konfigurationen der Assets gehören dazu.",
		domain: "asset",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Asset- und Prozessinventar mit Abhängigkeitsmapping"],
		relatedRequirements: [
			"iso27001:A.5.9",
			"iso27001:A.5.12",
			"iso27001:A.8.9",
			"nis2:Art.21(2)(a)",
		],
		recommendations: [
			{
				level: "must",
				text: "Inventar aller IKT-Assets mit Owner, Klassifizierung, Standort und unterstützter Geschäftsfunktion pflegen und jährlich bestätigen.",
				source: "ISO 27002",
				ref: "A.5.9",
			},
			{
				level: "should",
				text: "Abhängigkeiten zwischen Prozessen, Anwendungen, Infrastruktur und Dienstleistern grafisch abbilden, um kritische Pfade sichtbar zu machen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Geschäftsfunktionen sind als kritisch oder wichtig eingestuft und welche IKT-Assets unterstützen sie?",
			"Wann wurde die Klassifizierung zuletzt überprüft?",
		],
		pitfalls: [
			"Inventar führt Hardware und Server, aber keine SaaS-Dienste und Informations-Assets.",
		],
		tools: {
			startup: ["Snipe-IT", "Lansweeper"],
			scale: ["ServiceNow CMDB", "LeanIX (EAM)"],
		},
		sortOrder: 90,
	},
	{
		code: "Art.8(5-7)",
		sectionCode: "II",
		title: "Drittanbieter-Abhängigkeiten und Altsysteme",
		requirementText:
			"Das Finanzunternehmen identifiziert und dokumentiert alle Prozesse, die von IKT-Drittdienstleistern abhängen, sowie Verflechtungen mit Dienstleistern, die kritische oder wichtige Funktionen unterstützen. Es pflegt Inventare der IKT-Assets und aktualisiert sie bei größeren Änderungen; speziell Altsysteme (Legacy) werden regelmäßig, mindestens jährlich, einer IKT-Risikobewertung unterzogen.",
		guidance:
			"Legacy-Bewertung pragmatisch als Spalte im Asset-Inventar (Supportende, Patch-Stand, Ablösungsplan) führen und jährlich im Review bestätigen.",
		domain: "asset",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Abhängigkeitsregister", "Legacy-Risikobewertung"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.9",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jedes Altsystem Supportende, Risikobewertung und Ablösungs- oder Kompensationsplan dokumentieren.",
				source: "intern",
			},
			{
				level: "should",
				text: "Abhängigkeitsregister mit dem Informationsregister nach Art. 28 Abs. 3 verzahnen, um Doppelerfassung zu vermeiden.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Altsysteme sind im Einsatz und wann wurde ihr Risiko zuletzt bewertet?",
		],
		tools: { startup: ["LeanIX", "Ardoq"], scale: [] },
		sortOrder: 100,
	},
	{
		code: "Art.9(1)",
		sectionCode: "II",
		title: "Laufende Überwachung der IKT-Systeme",
		requirementText:
			"Zum angemessenen Schutz der IKT-Systeme und zur Organisation von Reaktionsmaßnahmen überwacht und kontrolliert das Finanzunternehmen kontinuierlich die Sicherheit und das Funktionieren der IKT-Systeme und -Tools und minimiert die Auswirkungen von IKT-Risiko durch den Einsatz geeigneter Tools, Richtlinien und Verfahren.",
		domain: "operations",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Betriebsrichtlinie nach RTS 2024/1774",
			"Monitoring-Nachweise",
		],
		relatedRequirements: [
			"iso27001:A.8.16",
			"iso27001:A.8.15",
			"nis2:Art.21(2)(e)",
		],
		recommendations: [
			{
				level: "must",
				text: "Zentrales Logging und Monitoring für alle produktiven Systeme mit definierter Aufbewahrung und Alarmierung einrichten.",
				source: "ISO 27002",
				ref: "A.8.15",
			},
		],
		auditQuestions: [
			"Wie werden Sicherheit und Funktionsweise der IKT-Systeme laufend überwacht und wer reagiert auf Alarme?",
		],
		sortOrder: 110,
	},
	{
		code: "Art.9(2)",
		sectionCode: "II",
		title: "IKT-Sicherheitsrichtlinien und Verschlüsselung",
		requirementText:
			"Das Finanzunternehmen konzipiert, beschafft und implementiert IKT-Sicherheitsrichtlinien, -verfahren, -protokolle und -tools, die die Resilienz, Kontinuität und Verfügbarkeit der IKT-Systeme, insbesondere der kritischen oder wichtigen Funktionen, sicherstellen und hohe Standards für Verfügbarkeit, Authentizität, Integrität und Vertraulichkeit der Daten bei Speicherung, Nutzung und Übertragung aufrechterhalten – einschließlich Verschlüsselung.",
		guidance:
			"Krypto-Richtlinie nach RTS 2024/1774 Art. 6–7: zugelassene Algorithmen, Schlüsselverwaltung über den Lebenszyklus, Verschlüsselung at rest und in transit, regelmäßige Überprüfung gegen den Stand der Technik.",
		domain: "crypto",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Sicherheitsrichtlinie nach RTS 2024/1774",
			"Krypto-Richtlinie",
		],
		relatedRequirements: [
			"iso27001:A.8.24",
			"nis2:Art.21(2)(h)",
			"iso27001:A.5.1",
		],
		recommendations: [
			{
				level: "must",
				text: "Krypto-Richtlinie mit Algorithmenliste, Schlüssellängen, Rotationsfristen und Verantwortlichkeiten verabschieden.",
				source: "ISO 27002",
				ref: "A.8.24",
			},
			{
				level: "should",
				text: "Für Signatur- und Custody-Schlüssel HSM oder gleichwertige Sicherung einsetzen und die Entscheidung dokumentieren.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Verschlüsselungsstandards gelten für Daten at rest und in transit und wie werden Schlüssel verwaltet?",
		],
		pitfalls: [
			"Verschlüsselung technisch vorhanden, aber ohne Richtlinie zu Algorithmen und Schlüsselwechsel – der Nachweis fehlt.",
		],
		tools: { startup: [], scale: ["Utimaco (HSM)", "Thales (HSM)"] },
		sortOrder: 120,
	},
	{
		code: "Art.9(3)",
		sectionCode: "II",
		title: "Werkzeuge gegen Datenverlust und für Datenintegrität",
		requirementText:
			"Das Finanzunternehmen setzt IKT-Lösungen und -Prozesse ein, die die Sicherheit der Datenübertragung gewährleisten, das Risiko von Datenkorruption, -verlust und unbefugtem Zugriff sowie technischer Mängel minimieren, Verfügbarkeitsmangel verhindern, Integritäts- und Vertraulichkeitsverletzungen abwehren und sicherstellen, dass Daten vor Risiken aus dem Datenmanagement geschützt sind.",
		domain: "operations",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Richtliniensatz nach RTS 2024/1774",
			"DLP- und Integritätskontrollen",
		],
		relatedRequirements: [
			"iso27001:A.8.12",
			"iso27001:A.8.7",
			"iso27001:A.5.33",
		],
		recommendations: [
			{
				level: "must",
				text: "Malware-Schutz, Integritätsprüfungen und Transportverschlüsselung auf allen Endpunkten und Servern erzwingen.",
				source: "ISO 27002",
				ref: "A.8.7",
			},
			{
				level: "could",
				text: "DLP-Regeln für Kunden- und Transaktionsdaten in E-Mail und Cloud-Speicher aktivieren.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Kontrollen verhindern Datenverlust und Datenkorruption in Produktion?",
		],
		sortOrder: 130,
	},
	{
		code: "Art.9(4)(a)",
		sectionCode: "II",
		title: "Informationssicherheitsleitlinie",
		requirementText:
			"Das Finanzunternehmen erarbeitet und dokumentiert eine Informationssicherheitsleitlinie mit Regeln zum Schutz der Verfügbarkeit, Authentizität, Integrität und Vertraulichkeit von Daten sowie der Informations- und IKT-Assets, einschließlich der Assets seiner Kunden, soweit zutreffend.",
		guidance:
			"Die ISO-27001-Leitlinie (Klausel 5.2) erfüllt die Anforderung, wenn sie die vier Schutzziele und die Kunden-Assets ausdrücklich benennt.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: ["Informationssicherheitsleitlinie"],
		relatedRequirements: [
			"iso27001:5.2",
			"iso27001:A.5.1",
			"nis2:Art.21(2)(a)",
		],
		recommendations: [
			{
				level: "must",
				text: "Leitlinie von der Geschäftsleitung unterzeichnen lassen, allen Mitarbeitenden bekannt geben und jährlich überprüfen.",
				source: "ISO 27002",
				ref: "A.5.1",
			},
		],
		auditQuestions: [
			"Ist die Informationssicherheitsleitlinie freigegeben, kommuniziert und aktuell?",
		],
		sortOrder: 140,
	},
	{
		code: "Art.9(4)(b)",
		sectionCode: "II",
		title: "Netz- und Infrastrukturmanagement",
		requirementText:
			"Das Finanzunternehmen richtet nach einem risikobasierten Ansatz eine solide Struktur für das Netz- und Infrastrukturmanagement ein und verwendet geeignete Techniken, Methoden und Protokolle, einschließlich automatisierter Mechanismen zur Isolierung betroffener Informations-Assets im Fall von Cyberangriffen.",
		guidance:
			"Netzsegmentierung zwischen Büro-IT, Produktions- und Zahlungs-/Custody-Umgebung, dokumentierte Firewall-Regeln und ein geübter Isolationsmechanismus (z. B. Quarantäne-VLAN, Cloud-Security-Group-Lockdown).",
		domain: "network",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Netzsicherheitsrichtlinie nach RTS 2024/1774",
			"Netzpläne",
			"Firewall-Regelwerk",
		],
		relatedRequirements: [
			"iso27001:A.8.20",
			"iso27001:A.8.22",
			"nis2:Art.21(2)(e)",
		],
		recommendations: [
			{
				level: "must",
				text: "Netzsegmente nach Kritikalität trennen und Regelwerke mindestens jährlich reviewen.",
				source: "ISO 27002",
				ref: "A.8.22",
			},
			{
				level: "should",
				text: "Automatisierte Isolierung kompromittierter Systeme (EDR-Containment) einrichten und im Vorfall-Playbook verankern.",
				source: "ENISA",
			},
		],
		auditQuestions: [
			"Wie ist das Netz segmentiert und wie werden betroffene Systeme im Angriffsfall isoliert?",
		],
		sortOrder: 150,
	},
	{
		code: "Art.9(4)(c)",
		sectionCode: "II",
		title: "Zugangsbeschränkung und Least Privilege",
		requirementText:
			"Das Finanzunternehmen implementiert Richtlinien, die den physischen und logischen Zugang zu Informations- und IKT-Assets auf das beschränken, was für rechtmäßige und zulässige Funktionen und Tätigkeiten erforderlich ist, und legt dafür Richtlinien, Verfahren und Kontrollen für Zugangsrechte fest und wendet sie solide an.",
		guidance:
			"Berechtigungskonzept nach Need-to-know, Rollenmodell, dokumentierter Join/Move/Leave-Prozess und halbjährliche Rezertifizierung privilegierter Rechte.",
		domain: "access",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"IAM-Richtlinie nach RTS 2024/1774",
			"Berechtigungskonzept",
			"Rezertifizierungsprotokolle",
		],
		relatedRequirements: [
			"iso27001:A.5.15",
			"iso27001:A.5.18",
			"iso27001:A.8.2",
			"nis2:Art.21(2)(i)",
		],
		recommendations: [
			{
				level: "must",
				text: "Alle Zugänge über zentrales IAM vergeben, privilegierte Rechte getrennt führen und mindestens halbjährlich rezertifizieren.",
				source: "ISO 27002",
				ref: "A.5.18",
			},
			{
				level: "should",
				text: "Privileged Access Management mit Session-Aufzeichnung für Produktions- und Custody-Systeme einführen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wie wird sichergestellt, dass Zugangsrechte dem Need-to-know-Prinzip folgen und zeitnah entzogen werden?",
		],
		pitfalls: [
			"Geteilte Admin-Accounts ohne personenbezogene Zuordnung – keine Nachvollziehbarkeit.",
		],
		tools: { startup: ["Teleport (PAM)"], scale: ["CyberArk (PAM)"] },
		sortOrder: 160,
	},
	{
		code: "Art.9(4)(d)",
		sectionCode: "II",
		title: "Starke Authentisierung und Schlüsselschutz",
		requirementText:
			"Das Finanzunternehmen implementiert Richtlinien und Protokolle für starke Authentisierungsmechanismen auf Grundlage einschlägiger Standards und spezieller Kontrollsysteme sowie Schutzmaßnahmen für kryptografische Schlüssel, bei denen Daten auf Basis genehmigter Datenklassifizierungs- und IKT-Risikobewertungsprozesse verschlüsselt werden.",
		guidance:
			"MFA für alle Nutzer, phishing-resistent (FIDO2/Passkeys) für Administratoren; Schlüssel für Zahlungs- und Custody-Funktionen in HSM oder MPC mit dokumentiertem Lebenszyklus.",
		domain: "access",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Authentisierungsrichtlinie",
			"Schlüsselmanagement-Verfahren",
		],
		relatedRequirements: [
			"iso27001:A.5.17",
			"iso27001:A.8.5",
			"iso27001:A.8.24",
			"nis2:Art.21(2)(j)",
		],
		recommendations: [
			{
				level: "must",
				text: "MFA für alle Zugänge erzwingen, für privilegierte Zugänge phishing-resistente Verfahren verwenden.",
				source: "ENISA",
			},
			{
				level: "should",
				text: "Schlüsselverwaltung mit Vier-Augen-Prinzip für Erzeugung, Backup und Vernichtung dokumentieren.",
				source: "ISO 27002",
				ref: "A.8.24",
			},
		],
		auditQuestions: [
			"Welche Authentisierungsverfahren gelten für Nutzer und Administratoren und wie sind kryptografische Schlüssel geschützt?",
		],
		tools: {
			startup: ["Teleport (PAM)"],
			scale: ["CyberArk (PAM)", "Utimaco (HSM)", "Thales (HSM)"],
		},
		sortOrder: 170,
	},
	{
		code: "Art.9(4)(e)",
		sectionCode: "II",
		title: "IKT-Änderungsmanagement",
		requirementText:
			"Das Finanzunternehmen implementiert dokumentierte Richtlinien, Verfahren und Kontrollen für das IKT-Änderungsmanagement, einschließlich Änderungen an Software, Hardware, Firmware-Komponenten, Systemen und Sicherheitsparametern, die auf einem Risikobewertungsansatz beruhen und Bestandteil des Gesamtprozesses des Änderungsmanagements sind. Änderungen werden kontrolliert, protokolliert, getestet, bewertet und genehmigt; Notfalländerungen folgen einem eigenen Verfahren.",
		guidance:
			"Pull-Request-basierter Change-Prozess mit Pflicht-Review, automatisierten Tests und Freigabe durch eine zweite Person; Notfall-Changes nachträglich innerhalb von 48 h dokumentieren.",
		domain: "development",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: [
			"Change-Richtlinie nach RTS 2024/1774",
			"Change-Protokolle",
			"Notfall-Change-Nachweise",
		],
		relatedRequirements: [
			"iso27001:A.8.32",
			"iso27001:A.8.25",
			"nis2:Art.21(2)(e)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jede Produktionsänderung mit Ticket, Risikobewertung, Test und Freigabe nachweisbar dokumentieren.",
				source: "ISO 27002",
				ref: "A.8.32",
			},
			{
				level: "should",
				text: "Notfall-Changes separat kennzeichnen und monatlich durch die zweite Linie auswerten.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie werden Änderungen an Produktionssystemen getestet, freigegeben und protokolliert?",
		],
		pitfalls: [
			"Entwickler deployen mit eigenem Produktionszugang ohne unabhängige Freigabe.",
		],
		sortOrder: 180,
	},
	{
		code: "Art.9(4)(f)",
		sectionCode: "II",
		title: "Patch- und Update-Management",
		requirementText:
			"Das Finanzunternehmen verfügt über angemessene und umfassende dokumentierte Richtlinien für Patches und Updates, die Prioritäten nach Kritikalität der Schwachstellen und Systeme festlegen und die zeitnahe Installation sowie die Behandlung von Ausnahmen regeln.",
		guidance:
			"Patch-SLA nach CVSS und Exponiertheit (z. B. kritisch extern erreichbar: 72 h), automatisiertes Scanning, dokumentierte Ausnahmen mit Ablaufdatum.",
		domain: "operations",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: ["Patch-Richtlinie", "Patch-Reports", "Ausnahmeregister"],
		relatedRequirements: ["iso27001:A.8.8", "nis2:Art.21(2)(e)"],
		recommendations: [
			{
				level: "must",
				text: "Patch-Fristen je Kritikalitätsstufe festlegen und Einhaltung monatlich auswerten.",
				source: "ISO 27002",
				ref: "A.8.8",
			},
		],
		auditQuestions: [
			"Welche Fristen gelten für das Einspielen kritischer Patches und wie wird ihre Einhaltung überwacht?",
		],
		sortOrder: 190,
	},
	{
		code: "Art.10",
		sectionCode: "II",
		title: "Erkennung anomaler Aktivitäten",
		requirementText:
			"Das Finanzunternehmen verfügt über Mechanismen, um anomale Aktivitäten, einschließlich Problemen bei der Netzleistung und IKT-bezogenen Vorfällen, umgehend zu erkennen und potenzielle einzelne wesentliche Schwachstellen zu ermitteln. Die Erkennungsmechanismen ermöglichen mehrere Kontrollebenen, legen Alarmschwellen und -kriterien fest, lösen Reaktionsprozesse aus und überwachen Nutzeraktivität sowie die Fehlerquote von IKT-Systemen.",
		guidance:
			"Ein SIEM (Open Source oder Managed) mit dokumentierten Use-Cases, Schwellenwerten und Eskalationswegen; Reaktionszeiten über ein MDR-Angebot absichern, wenn kein 24/7-Team existiert.",
		domain: "operations",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["SIEM-Use-Cases", "Alarmregeln"],
		relatedRequirements: [
			"iso27001:A.8.16",
			"iso27001:A.8.15",
			"nis2:Art.21(2)(b)",
		],
		recommendations: [
			{
				level: "must",
				text: "Erkennungsregeln mit definierten Schwellenwerten für Authentisierung, Berechtigungsänderungen, Datenabfluss und Verfügbarkeit betreiben und regelmäßig testen.",
				source: "ISO 27002",
				ref: "A.8.16",
			},
			{
				level: "should",
				text: "Alarme außerhalb der Geschäftszeiten über einen MDR-Dienst oder Bereitschaft abdecken.",
				source: "ENISA",
			},
		],
		auditQuestions: [
			"Welche Use-Cases erkennt das Monitoring und wie wurden die Schwellenwerte festgelegt?",
			"Wie schnell wird auf einen kritischen Alarm reagiert?",
		],
		pitfalls: [
			"Logs werden gesammelt, aber niemand bewertet die Alarme – Erkennung ohne Reaktion.",
		],
		tools: {
			startup: ["Wazuh", "Elastic"],
			scale: [
				"Microsoft Sentinel",
				"Splunk",
				"Arctic Wolf (MDR)",
				"Telekom MDR",
			],
		},
		sortOrder: 200,
	},
	{
		code: "Art.11(1-2)",
		sectionCode: "II",
		title: "IKT-Geschäftsfortführungsleitlinie und -pläne",
		requirementText:
			"Das Finanzunternehmen richtet eine umfassende IKT-Geschäftsfortführungsleitlinie ein, die als Teil der allgemeinen Geschäftsfortführungsleitlinie dokumentiert ist, und setzt sie über Vorkehrungen, Pläne, Verfahren und Mechanismen um, die die Kontinuität kritischer oder wichtiger Funktionen sicherstellen, schnell und angemessen auf IKT-Vorfälle reagieren, Verluste begrenzen und Reaktions- und Wiederherstellungsmaßnahmen aktivieren.",
		guidance:
			"Eine BCM-Leitlinie mit IKT-Kapitel, je kritischer Funktion ein Notfallplan (Ausfall Rechenzentrum, Cloud-Region, Zahlungsdienstleister, Schlüsselpersonal) – kompakt, aber geübt.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["BCM-Leitlinie", "Notfallpläne"],
		relatedRequirements: [
			"iso27001:A.5.29",
			"iso27001:A.5.30",
			"nis2:Art.21(2)(c)",
		],
		recommendations: [
			{
				level: "must",
				text: "Reaktions- und Wiederherstellungspläne für jede kritische oder wichtige Funktion schriftlich festlegen und Verantwortliche benennen.",
				source: "ISO 27002",
				ref: "A.5.30",
			},
			{
				level: "should",
				text: "Pläne so gestalten, dass sie auch ohne Zugriff auf die betroffenen Systeme auffindbar sind (Offline-Kopie).",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Geschäftsfortführungspläne existieren für kritische Funktionen und wann wurden sie zuletzt aktualisiert?",
		],
		tools: { startup: ["HiScout BCM", "Fusion Risk Management"], scale: [] },
		sortOrder: 210,
	},
	{
		code: "Art.11(5)",
		sectionCode: "II",
		title: "Business-Impact-Analyse",
		requirementText:
			"Im Rahmen des IKT-Risikomanagements führt das Finanzunternehmen eine Business-Impact-Analyse (BIA) seiner Anfälligkeit für schwerwiegende Betriebsstörungen durch. Die BIA bewertet mögliche Auswirkungen anhand quantitativer und qualitativer Kriterien und berücksichtigt die Kritikalität der identifizierten Geschäftsfunktionen, Prozesse und Abhängigkeiten. Daraus werden Wiederherstellungsziele (RTO/RPO) und IKT-Anforderungen abgeleitet.",
		guidance:
			"BIA tabellarisch je Geschäftsprozess mit maximal tolerierbarer Ausfallzeit, RTO, RPO, Mindestbetriebsniveau und benötigten Ressourcen; jährlich aktualisieren.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["BIA", "RTO-/RPO-Festlegung"],
		relatedRequirements: ["iso27001:A.5.29", "iso27001:A.5.30"],
		recommendations: [
			{
				level: "must",
				text: "Für jede kritische oder wichtige Funktion RTO und RPO festlegen und mit den technischen Fähigkeiten (Backup, Redundanz) abgleichen.",
				source: "EBA GL",
				ref: "EBA/GL/2019/04",
			},
		],
		auditQuestions: [
			"Welche RTO und RPO gelten für die kritischen Funktionen und wie wurden sie hergeleitet?",
		],
		pitfalls: [
			"RTO/RPO festgelegt, aber Backup-Intervalle und Wiederanlaufzeiten technisch nicht dazu passend.",
		],
		tools: { startup: ["HiScout BCM", "Fusion Risk Management"], scale: [] },
		sortOrder: 220,
	},
	{
		code: "Art.11(6)",
		sectionCode: "II",
		title: "Jährliche Tests der Geschäftsfortführungspläne",
		requirementText:
			"Das Finanzunternehmen testet die IKT-Geschäftsfortführungspläne sowie die IKT-Reaktions- und Wiederherstellungspläne mindestens jährlich und nach wesentlichen Änderungen an IKT-Systemen, die kritische oder wichtige Funktionen unterstützen. Die Tests umfassen Szenarien von Cyberangriffen und Umstellungen zwischen Primär- und Redundanzinfrastruktur sowie die Pläne der IKT-Drittdienstleister, soweit relevant.",
		guidance:
			"Mindestens eine Tischübung und ein technischer Wiederanlauftest pro Jahr, davon ein Szenario mit Ausfall eines kritischen Dienstleisters; Ergebnisse mit Maßnahmen protokollieren.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Testberichte", "Übungsprotokolle", "Maßnahmenliste"],
		relatedRequirements: ["iso27001:A.5.30", "nis2:Art.21(2)(c)"],
		recommendations: [
			{
				level: "must",
				text: "Jahresübungsplan mit Szenario, Teilnehmenden, Ergebnis und Verbesserungsmaßnahmen dokumentieren.",
				source: "ISO 27002",
				ref: "A.5.30",
			},
			{
				level: "should",
				text: "Mindestens ein Szenario pro Jahr mit Ausfall eines kritischen IKT-Drittdienstleisters üben.",
				source: "EBA GL",
				ref: "EBA/GL/2019/04",
			},
		],
		auditQuestions: [
			"Wann wurden die Notfallpläne zuletzt getestet und welche Szenarien wurden geübt?",
		],
		pitfalls: [
			"Nur Tischübungen, nie ein echter technischer Wiederanlauf – der Nachweis der Wirksamkeit fehlt.",
		],
		tools: { startup: ["HiScout BCM", "Fusion Risk Management"], scale: [] },
		sortOrder: 230,
	},
	{
		code: "Art.11(7)",
		sectionCode: "II",
		title: "Krisenmanagementfunktion",
		requirementText:
			"Das Finanzunternehmen verfügt über eine Krisenmanagementfunktion, die bei Aktivierung der Geschäftsfortführungs- oder Wiederherstellungspläne klare Verfahren für das Management interner und externer Krisenkommunikation nach Art. 14 festlegt. Die Funktion verfügt über Eskalationsregeln, Entscheidungsbefugnisse und Kommunikationswege.",
		guidance:
			"Krisenstab mit benannten Rollen (Leitung, IT, Kommunikation, Recht/Compliance), Alarmierungsliste und Einberufungsregel; mit der Notfallübung gemeinsam testen.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: [
			"Krisenstabsordnung",
			"Alarmierungsliste",
			"Kommunikationsplan",
		],
		relatedRequirements: ["iso27001:A.5.29", "iso27001:A.5.24"],
		recommendations: [
			{
				level: "must",
				text: "Krisenstab mit Rollen, Vertretungen und Einberufungskriterien schriftlich festlegen.",
				source: "intern",
			},
			{
				level: "could",
				text: "Alarmierungstool mit Erreichbarkeitstest nutzen, wenn das Team wächst oder verteilt arbeitet.",
				source: "intern",
			},
		],
		auditQuestions: ["Wer bildet den Krisenstab und wie wird er alarmiert?"],
		tools: { startup: ["F24 (FACT24)", "Everbridge"], scale: [] },
		sortOrder: 240,
	},
	{
		code: "Art.12(1)",
		sectionCode: "II",
		title: "Backup-Richtlinie und Wiederherstellungsverfahren",
		requirementText:
			"Das Finanzunternehmen entwickelt und dokumentiert Richtlinien und Verfahren für die Datensicherung, die Umfang und Häufigkeit der Sicherung nach Kritikalität und Vertraulichkeit der Daten festlegen, sowie Wiederherstellungsverfahren und -methoden. Backup-Systeme werden so betrieben, dass eine Sicherung die Sicherheit der Produktionssysteme nicht gefährdet, und Daten werden an einem physisch und logisch getrennten Standort gespeichert.",
		guidance:
			"3-2-1-Regel, unveränderliche Backups (Object Lock) in einer zweiten Region oder bei einem zweiten Anbieter, Verschlüsselung der Sicherungen und dokumentierte Restore-Anleitung.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Backup-Konzept", "Wiederherstellungsverfahren"],
		relatedRequirements: ["iso27001:A.8.13", "nis2:Art.21(2)(c)"],
		recommendations: [
			{
				level: "must",
				text: "Backup-Richtlinie mit Sicherungsintervallen je Datenklasse, Aufbewahrung, Verschlüsselung und getrenntem Standort verabschieden.",
				source: "ISO 27002",
				ref: "A.8.13",
			},
			{
				level: "should",
				text: "Backups unveränderlich speichern und den Zugriff mit separaten Zugangsdaten vom Produktionszugang trennen.",
				source: "ENISA",
			},
		],
		auditQuestions: [
			"Wie oft werden kritische Daten gesichert und wo liegen die Sicherungen?",
		],
		pitfalls: [
			"Backups im selben Cloud-Konto und mit denselben Admin-Rechten wie Produktion – Ransomware trifft beides.",
		],
		tools: {
			startup: ["Veeam", "Rubrik", "Cohesity", "S3 Object Lock"],
			scale: [],
		},
		sortOrder: 250,
	},
	{
		code: "Art.12(2)",
		sectionCode: "II",
		title: "Wiederherstellungstests und Redundanz",
		requirementText:
			"Das Finanzunternehmen richtet redundante IKT-Kapazitäten mit ausreichenden Ressourcen ein, um den Geschäftsbedarf zu decken, und testet Backup- und Wiederherstellungsverfahren regelmäßig. Bei der Wiederherstellung werden Systeme verwendet, die von der Quelle des Vorfalls getrennt sind; Sekundärstandorte sind geografisch getrennt und für die Fortführung kritischer Funktionen ausgelegt.",
		guidance:
			"Quartalsweiser Restore-Test mit Zeitmessung gegen RTO/RPO, mindestens jährlich ein vollständiger Wiederanlauf einer kritischen Anwendung aus dem Backup in isolierter Umgebung.",
		domain: "continuity",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Restore-Protokolle", "Redundanznachweise"],
		relatedRequirements: [
			"iso27001:A.8.13",
			"iso27001:A.8.14",
			"nis2:Art.21(2)(c)",
		],
		recommendations: [
			{
				level: "must",
				text: "Wiederherstellungstests mit gemessener Dauer und Vollständigkeitsprüfung protokollieren und mit RTO/RPO vergleichen.",
				source: "ISO 27002",
				ref: "A.8.13",
			},
		],
		auditQuestions: [
			"Wann wurde zuletzt eine vollständige Wiederherstellung getestet und wurde das RTO eingehalten?",
		],
		tools: {
			startup: ["Veeam", "Rubrik", "Cohesity", "S3 Object Lock"],
			scale: [],
		},
		sortOrder: 260,
	},
	{
		code: "Art.13(1-5)",
		sectionCode: "II",
		title: "Lernen und Weiterentwicklung",
		requirementText:
			"Das Finanzunternehmen verfügt über Kapazitäten, um Informationen über Schwachstellen, Cyberbedrohungen und IKT-Vorfälle zu sammeln und deren Auswirkungen auf die Resilienz zu analysieren. Nach schwerwiegenden Vorfällen werden Nachprüfungen durchgeführt, Ursachen ermittelt und Verbesserungen abgeleitet; die Erkenntnisse fließen in Risikobewertung und Rahmenwerk ein und werden an die Geschäftsleitung berichtet.",
		guidance:
			"Post-Incident-Review-Vorlage (Zeitlinie, Ursache, Wirksamkeit der Reaktion, Maßnahmen) und ein Threat-Intel-Abonnement (CERT-Bund, Branchenwarnungen) genügen zum Start.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		evidenceHints: [
			"Lessons-Learned-Berichte",
			"Bedrohungsanalysen",
			"GL-Berichte",
		],
		relatedRequirements: ["iso27001:A.5.27", "iso27001:A.5.7", "iso27001:10.1"],
		recommendations: [
			{
				level: "must",
				text: "Für jeden schwerwiegenden Vorfall einen Post-Incident-Review mit Ursachenanalyse und nachverfolgten Maßnahmen erstellen.",
				source: "ISO 27002",
				ref: "A.5.27",
			},
			{
				level: "should",
				text: "Threat-Intelligence-Quellen abonnieren und monatlich auf Relevanz für die eigene Infrastruktur auswerten.",
				source: "ENISA",
			},
		],
		auditQuestions: [
			"Wie werden Erkenntnisse aus Vorfällen und Bedrohungsinformationen in das Rahmenwerk zurückgespielt?",
		],
		tools: {
			startup: ["CERT-Bund (Threat Intel)", "Recorded Future"],
			scale: [],
		},
		sortOrder: 270,
	},
	{
		code: "Art.13(6)",
		sectionCode: "II",
		title: "Schulungsprogramme für alle Mitarbeitenden",
		requirementText:
			"Das Finanzunternehmen entwickelt Programme zur Sensibilisierung für IKT-Sicherheit und Schulungen zur digitalen operationalen Resilienz als Pflichtmodule in seinen Schulungsprogrammen für alle Mitarbeitenden und die Geschäftsleitung, mit einer Komplexität, die ihrem Aufgabenbereich entspricht. Soweit angemessen werden auch IKT-Drittdienstleister einbezogen.",
		guidance:
			"Jährliche Pflichtschulung plus rollenspezifische Module (Entwicklung, Betrieb, Kundenservice) und Phishing-Simulationen; Teilnahmequote als KPI an die Geschäftsleitung berichten.",
		domain: "hr",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Awareness-Programm", "Teilnahmenachweise"],
		relatedRequirements: [
			"iso27001:7.2",
			"iso27001:7.3",
			"iso27001:A.6.3",
			"nis2:Art.21(2)(g)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jährliche Pflichtschulung für alle Mitarbeitenden mit Teilnahmenachweis und Nachhol-Mechanismus für Neue und Säumige.",
				source: "ISO 27002",
				ref: "A.6.3",
			},
			{
				level: "should",
				text: "Phishing-Simulationen quartalsweise durchführen und Ergebnisse als Reifegrad-Kennzahl nutzen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Schulungen sind für Mitarbeitende verpflichtend und wie hoch war die Teilnahmequote im letzten Jahr?",
		],
		tools: { startup: ["SoSafe", "KnowBe4"], scale: [] },
		sortOrder: 280,
	},
	{
		code: "Art.14",
		sectionCode: "II",
		title: "Krisenkommunikation",
		requirementText:
			"Das Finanzunternehmen verfügt über Krisenkommunikationspläne, die eine verantwortungsvolle Offenlegung zumindest schwerwiegender IKT-Vorfälle oder Schwachstellen gegenüber Kunden, Gegenparteien und der Öffentlichkeit ermöglichen. Es setzt Kommunikationsleitlinien für interne Mitarbeitende und externe Interessenträger um und benennt mindestens eine Person als Sprecher für Medien und Öffentlichkeit.",
		guidance:
			"Kommunikationsplan mit Vorlagen (Kundeninformation, Statuspage, Pressemitteilung), Freigabeweg und benannter Sprecherin; interne Information der Mitarbeitenden nach Betroffenheit abstufen.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		evidenceHints: [
			"Kommunikationsplan",
			"Benennung Sprecherfunktion",
			"Vorlagen",
		],
		relatedRequirements: ["iso27001:A.5.24", "iso27001:A.5.26", "nis2:Art.23"],
		recommendations: [
			{
				level: "must",
				text: "Krisenkommunikationsplan mit Zielgruppen, Kanälen, Vorlagen, Freigabe und benannter Sprecherfunktion verabschieden.",
				source: "intern",
			},
			{
				level: "could",
				text: "Öffentliche Statuspage für Verfügbarkeitsinformationen vorbereiten, um Kunden im Vorfall schnell zu informieren.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wer spricht im Krisenfall nach außen und welche Vorlagen liegen bereit?",
		],
		tools: { startup: ["F24", "Everbridge"], scale: [] },
		sortOrder: 290,
	},
	{
		code: "Art.15",
		sectionCode: "II",
		title: "Konkretisierung durch RTS 2024/1774",
		requirementText:
			"Die Anforderungen der Art. 6–14 werden durch die Delegierte Verordnung (EU) 2024/1774 (RTS zum IKT-Risikomanagementrahmen) konkretisiert: Sicherheits-, Asset-, Krypto-, Betriebs-, Netz-, Change- und IAM-Richtlinien, Erkennung, Geschäftsfortführung und Berichterstattung. Das Finanzunternehmen weist nach, dass jede RTS-Vorgabe einer eigenen Richtlinie oder Maßnahme zugeordnet ist.",
		guidance:
			"Mapping-Tabelle RTS-Artikel → interne Richtlinie → Nachweis im GRC-Tool pflegen; Lücken als Maßnahmen mit Termin führen.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1774"],
		evidenceHints: ["Mapping RTS → Richtlinien"],
		relatedRequirements: ["iso27001:A.5.1", "iso27001:A.5.36"],
		recommendations: [
			{
				level: "must",
				text: "Vollständiges Mapping aller RTS-2024/1774-Artikel auf interne Richtlinien führen und jährlich auf Vollständigkeit prüfen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie wird nachgewiesen, dass alle Vorgaben der RTS 2024/1774 durch interne Richtlinien abgedeckt sind?",
		],
		pitfalls: [
			"Richtlinien vorhanden, aber ohne Referenz auf die RTS-Artikel – Prüfer müssen den Abgleich selbst machen.",
		],
		tools: { startup: ["GRC-Tool-Mapping"], scale: [] },
		sortOrder: 300,
	},
	{
		code: "Art.16",
		sectionCode: "II",
		title: "Vereinfachter Rahmen (Anwendbarkeitsprüfung)",
		requirementText:
			"Art. 16 gewährt bestimmten Kleinstfällen (u. a. nach PSD2 Art. 32 ausgenommene Zahlungsinstitute, kleine und nicht verflochtene Wertpapierfirmen, bestimmte E-Geld-Institute mit Ausnahme) einen vereinfachten IKT-Risikomanagementrahmen anstelle der Art. 5–15. Das Finanzunternehmen prüft und dokumentiert, ob es in den Anwendungsbereich fällt.",
		guidance:
			"Für ein lizenziertes ZAG-Institut mit CASP-Zulassung nicht anwendbar; Erleichterung nur über Art. 4 Verhältnismäßigkeit. Die dokumentierte Anwendbarkeitsprüfung ist dennoch der Nachweis.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Anwendbarkeitsprüfung"],
		relatedRequirements: ["iso27001:4.3", "nis2:Art.2-3"],
		recommendations: [
			{
				level: "must",
				text: "Anwendbarkeit von Art. 16 einmalig prüfen, verneinen und begründen; Verhältnismäßigkeit nach Art. 4 in jeder Richtlinie ausdrücklich adressieren.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wurde geprüft und dokumentiert, ob der vereinfachte Rahmen nach Art. 16 anwendbar ist?",
		],
		pitfalls: [
			"Als kleines Institut den vereinfachten Rahmen angenommen, obwohl die Lizenz den Vollrahmen verlangt.",
		],
		sortOrder: 310,
	},
	// ───────────────────────── Kapitel III – IKT-Vorfälle ─────────────────────────
	{
		code: "Art.17",
		sectionCode: "III",
		title: "Prozess für das Management IKT-bezogener Vorfälle",
		requirementText:
			"Das Finanzunternehmen definiert, etabliert und implementiert einen Prozess zur Erkennung, Handhabung und Meldung IKT-bezogener Vorfälle, erfasst alle Vorfälle und erheblichen Cyberbedrohungen, richtet Frühwarnindikatoren ein, legt Rollen und Zuständigkeiten je Vorfallart fest, plant die Kommunikation mit Mitarbeitenden, Kunden und Behörden und berichtet zumindest schwerwiegende Vorfälle an die Geschäftsleitung.",
		guidance:
			"Incident-Richtlinie mit Erfassungspflicht für alle Vorfälle (auch kleine), Schweregrad-Stufen, Eskalationsmatrix und Verweis auf das Melde-Playbook; Vorfallregister im ITSM oder GRC-Tool.",
		domain: "incident",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		evidenceHints: ["Incident-Management-Richtlinie", "Vorfallregister"],
		relatedRequirements: [
			"iso27001:A.5.24",
			"iso27001:A.5.25",
			"iso27001:A.5.26",
			"nis2:Art.21(2)(b)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jeden IKT-Vorfall mit Zeitstempel, Kategorie, Auswirkung, Maßnahmen und Abschluss im Vorfallregister erfassen.",
				source: "ISO 27002",
				ref: "A.5.24",
			},
			{
				level: "should",
				text: "Frühwarnindikatoren (z. B. Fehlerquote, Latenz, Auth-Fehlschläge) im Monitoring verankern und mit dem Vorfallprozess verknüpfen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie werden IKT-Vorfälle erfasst, klassifiziert und eskaliert?",
			"Wann wurde die Geschäftsleitung zuletzt über einen Vorfall informiert?",
		],
		pitfalls: [
			"Nur schwerwiegende Vorfälle werden dokumentiert – Art. 17 verlangt die Erfassung aller Vorfälle.",
		],
		tools: {
			startup: ["Jira Service Management", "PagerDuty"],
			scale: ["ServiceNow SecOps"],
		},
		sortOrder: 320,
	},
	{
		code: "Art.18",
		sectionCode: "III",
		title: "Klassifizierung von Vorfällen und Cyberbedrohungen",
		requirementText:
			"Das Finanzunternehmen klassifiziert IKT-bezogene Vorfälle und bestimmt deren Auswirkungen anhand der Kriterien Anzahl betroffener Kunden und Transaktionen, Dauer und Ausfallzeit, geografische Ausbreitung, Datenverluste, Kritikalität der betroffenen Dienste, wirtschaftliche Auswirkungen und Reputationsschaden. Die RTS 2024/1772 legt die Schwellenwerte für die Einstufung als schwerwiegend fest; erhebliche Cyberbedrohungen werden ebenfalls klassifiziert.",
		guidance:
			"Entscheidungsbaum mit den RTS-Schwellenwerten (z. B. mehr als 10 % der Kunden oder 100.000 Kunden, Ausfallzeit über 2 h bei kritischen Diensten, Kosten über 100.000 €) als Checkliste im Incident-Ticket hinterlegen.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1772"],
		evidenceHints: ["Klassifizierungsmatrix", "Bewertungsprotokolle"],
		relatedRequirements: ["iso27001:A.5.25", "nis2:Art.23"],
		recommendations: [
			{
				level: "must",
				text: "Klassifizierungsmatrix nach RTS 2024/1772 mit allen Kriterien und Schwellenwerten festlegen und jede Einstufung mit Zeitpunkt protokollieren.",
				source: "ESMA",
				ref: "RTS 2024/1772",
			},
			{
				level: "should",
				text: "Klassifizierung als Pflichtfeld im Incident-Ticket erzwingen, damit die Frist nach Art. 19 automatisch startet.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Nach welchen Kriterien wird entschieden, ob ein Vorfall schwerwiegend ist, und wer trifft die Entscheidung?",
		],
		pitfalls: [
			"Einstufung dauert Tage, weil Kriterien nicht griffbereit sind – die 24-h-Frist ab Kenntnis läuft trotzdem.",
		],
		tools: {
			startup: ["Entscheidungsbaum im ITSM", "GRC-Tool-Workflows"],
			scale: [],
		},
		sortOrder: 330,
	},
	{
		code: "Art.19",
		sectionCode: "III",
		title: "Meldung schwerwiegender IKT-Vorfälle an die BaFin",
		requirementText:
			"Schwerwiegende IKT-bezogene Vorfälle werden der BaFin gemeldet: Erstmeldung spätestens 4 Stunden nach Einstufung als schwerwiegend, in jedem Fall spätestens 24 Stunden nach Kenntnis; Zwischenmeldung spätestens 72 Stunden nach Abgabe der Erstmeldung; Abschlussmeldung spätestens 1 Monat nach Abgabe der Zwischenmeldung. Betroffene Kunden werden unverzüglich informiert; erhebliche Cyberbedrohungen können freiwillig gemeldet werden.",
		guidance:
			"Melde-Playbook mit Fristenrechner, vorausgefüllten Templates nach ITS 2025/302 und eingerichtetem Zugang zum BaFin-MVP-Portal (Fachverfahren DORA); Rückfallweg ikt-vorfall@bafin.de dokumentieren und Zugänge regelmäßig testen.",
		domain: "incident",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		legalBasisRefs: ["RTS 2025/301", "ITS 2025/302"],
		evidenceHints: ["Melde-Playbook", "ausgefüllte Templates", "MVP-Zugang"],
		relatedRequirements: ["nis2:Art.23", "iso27001:A.5.5", "iso27001:A.5.26"],
		recommendations: [
			{
				level: "must",
				text: "MVP-Zugang für mindestens zwei Personen einrichten, Fristenrechner und Templates im Playbook hinterlegen und jährlich einen Meldetest durchführen.",
				source: "BaFin",
				ref: "Fachverfahren DORA (MVP)",
			},
			{
				level: "should",
				text: "Vertraglich sicherstellen, dass IKT-Drittdienstleister Vorfälle so schnell melden, dass die eigene 24-h-Frist einhaltbar bleibt.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wer meldet schwerwiegende Vorfälle an die BaFin und wie wird die 4-h-/24-h-Frist überwacht?",
			"Wurde der Meldeweg über das MVP-Portal getestet?",
		],
		pitfalls: [
			"Uhr läuft ab Kenntnis, nicht ab Einstufung – eine verzögerte Klassifizierung verschiebt die 24-h-Frist nicht.",
		],
		tools: {
			startup: [
				"BaFin-MVP-Portal (Fachverfahren DORA)",
				"Rückfall: ikt-vorfall@bafin.de",
			],
			scale: [],
		},
		sortOrder: 340,
	},
	{
		code: "Art.20",
		sectionCode: "III",
		title: "Harmonisierte Meldeformate",
		requirementText:
			"Erst-, Zwischen- und Abschlussmeldungen werden in den von den ESAs harmonisierten Standardformularen, Mustern und Verfahren nach ITS 2025/302 übermittelt; die Inhalte und Datenfelder richten sich nach RTS 2025/301. Das Finanzunternehmen hält die Templates aktuell vor.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2025/301", "ITS 2025/302"],
		evidenceHints: ["Template-Bibliothek"],
		relatedRequirements: ["iso27001:A.5.5", "nis2:Art.23"],
		recommendations: [
			{
				level: "must",
				text: "Aktuelle BaFin-/ESA-Templates in der Dokumentenlenkung vorhalten und bei Änderungen der ITS aktualisieren.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Liegen die aktuellen Meldeformulare nach ITS 2025/302 vor und sind sie dem Melde-Playbook zugeordnet?",
		],
		tools: {
			startup: ["Regnology (Meldewesen-Software)"],
			scale: ["ServiceNow-Integration"],
		},
		sortOrder: 350,
	},
	{
		code: "Art.22",
		sectionCode: "III",
		title: "Aufsichtliche Rückmeldung verarbeiten",
		requirementText:
			"Nach Eingang einer Meldung kann die zuständige Behörde dem Finanzunternehmen Rückmeldung oder Orientierungshilfen geben, insbesondere zu Abhilfemaßnahmen und zur Minimierung der Auswirkungen. Das Finanzunternehmen berücksichtigt diese Rückmeldungen und dokumentiert die Umsetzung.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Feedback-Log"],
		relatedRequirements: ["iso27001:A.5.5", "iso27001:A.5.27"],
		recommendations: [
			{
				level: "should",
				text: "Rückmeldungen der BaFin je Vorfall im Vorfallregister verknüpfen und abgeleitete Maßnahmen nachverfolgen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie werden Rückmeldungen der Aufsicht zu gemeldeten Vorfällen dokumentiert und umgesetzt?",
		],
		sortOrder: 360,
	},
	{
		code: "Art.23",
		sectionCode: "III",
		title: "Zahlungsbezogene Betriebs- und Sicherheitsvorfälle",
		requirementText:
			"Die Anforderungen der Art. 17–22 gelten für Zahlungsinstitute, E-Geld-Institute und Kreditinstitute auch für zahlungsbezogene Betriebs- oder Sicherheitsvorfälle, die nicht IKT-bezogen sind. Die frühere Meldung nach PSD2 bzw. § 54 ZAG ist seit dem 17.01.2025 in das DORA-Meldewesen überführt.",
		guidance:
			"Klassifizierungsmatrix um Nicht-IKT-Zahlungsvorfälle (z. B. Betrugsserien, Prozessfehler in der Abwicklung) erweitern; derselbe Meldeweg und dieselben Fristen wie Art. 19.",
		domain: "incident",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2024/1772", "RTS 2025/301", "ITS 2025/302"],
		evidenceHints: [
			"Erweiterte Klassifizierung für Nicht-IKT-Zahlungsvorfälle",
		],
		relatedRequirements: ["iso27001:A.5.24", "nis2:Art.23"],
		recommendations: [
			{
				level: "must",
				text: "Im Vorfallprozess ausdrücklich festlegen, dass auch nicht IKT-bedingte Zahlungsvorfälle nach DORA klassifiziert und gemeldet werden.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Werden zahlungsbezogene Vorfälle ohne IKT-Ursache ebenfalls nach DORA klassifiziert und gemeldet?",
		],
		pitfalls: [
			"Altes § 54 ZAG-Meldeverfahren weiterhin im Prozess – seit 17.01.2025 läuft die Meldung über DORA.",
		],
		tools: {
			startup: [
				"BaFin-MVP-Portal (Fachverfahren DORA)",
				"Rückfall: ikt-vorfall@bafin.de",
			],
			scale: [],
		},
		sortOrder: 370,
	},
	// ───────────────────────── Kapitel IV – Testen der Resilienz ─────────────────────────
	{
		code: "Art.24",
		sectionCode: "IV",
		title: "Programm zum Testen der digitalen operationalen Resilienz",
		requirementText:
			"Das Finanzunternehmen richtet als Teil des IKT-Risikomanagementrahmens ein solides und umfassendes Programm zum Testen der digitalen operationalen Resilienz ein, verfolgt einen risikobasierten Ansatz, stellt sicher, dass Tests von unabhängigen internen oder externen Parteien durchgeführt werden, legt Verfahren zur Priorisierung und Behebung festgestellter Probleme fest und testet alle IKT-Systeme, die kritische oder wichtige Funktionen unterstützen, mindestens einmal jährlich.",
		guidance:
			"Jahrestestplan, der jede kritische Anwendung mindestens einer Testart zuordnet, mit Tester-Unabhängigkeit (extern oder organisatorisch getrennt) und Maßnahmen-Tracking bis zur Behebung.",
		domain: "development",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Testprogramm", "Jahresplan"],
		relatedRequirements: [
			"iso27001:A.8.29",
			"iso27001:9.1",
			"nis2:Art.21(2)(f)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jahrestestplan mit Zuordnung Testart je kritischem System, Verantwortlichen und Nachverfolgung der Feststellungen führen.",
				source: "intern",
			},
			{
				level: "should",
				text: "Tester-Unabhängigkeit dokumentieren: keine Tests durch Personen, die das System entwickelt oder betreiben.",
				source: "EBA GL",
				ref: "EBA/GL/2019/04",
			},
		],
		auditQuestions: [
			"Welche kritischen Systeme wurden im letzten Jahr getestet und wie wurde die Unabhängigkeit der Tester sichergestellt?",
		],
		pitfalls: [
			"Entwicklungsteam testet seine eigenen Systeme – fehlende Unabhängigkeit.",
		],
		tools: { startup: ["GRC-Tool"], scale: [] },
		sortOrder: 380,
	},
	{
		code: "Art.25",
		sectionCode: "IV",
		title: "Testarten für IKT-Tools und -Systeme",
		requirementText:
			"Das Testprogramm sieht die Durchführung angemessener Tests vor, etwa Schwachstellenbewertungen und -scans, Open-Source-Analysen, Netzsicherheitsbewertungen, Lückenanalysen, Überprüfungen der physischen Sicherheit, Fragebögen und Scansoftware, Quellcodeprüfungen, szenariobasierte Tests, Kompatibilitäts-, Leistungs- und End-to-End-Tests sowie Penetrationstests. Feststellungen werden priorisiert und behoben.",
		guidance:
			"Schwachstellenscans wöchentlich automatisiert, SCA/SAST in der Pipeline, jährlicher externer Pentest der Zahlungs-/CASP-Plattform; Smart-Contract-Audit vor Produktivnahme neuer Verträge.",
		domain: "development",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Testberichte je Testart", "Maßnahmenverfolgung"],
		relatedRequirements: [
			"iso27001:A.8.8",
			"iso27001:A.8.29",
			"iso27001:A.8.28",
			"nis2:Art.21(2)(e)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jährlicher externer Penetrationstest der kundenseitig erreichbaren Systeme mit nachgewiesener Behebung kritischer Feststellungen.",
				source: "BaFin",
			},
			{
				level: "should",
				text: "Automatisierte Schwachstellen- und Abhängigkeitsscans in die CI/CD-Pipeline integrieren und Ergebnisse mit Fristen tracken.",
				source: "ISO 27002",
				ref: "A.8.8",
			},
		],
		auditQuestions: [
			"Welche Testarten werden durchgeführt und wie werden Feststellungen bis zur Behebung nachverfolgt?",
		],
		tools: {
			startup: [
				"Greenbone",
				"Tenable",
				"Snyk",
				"SonarQube",
				"k6/JMeter (Last)",
				"Pentest: SySS",
				"usd",
				"Cure53",
				"Smart Contracts: Trail of Bits",
				"ChainSecurity",
			],
			scale: [],
		},
		sortOrder: 390,
	},
	{
		code: "Art.26",
		sectionCode: "IV",
		title: "Bedrohungsorientierte Penetrationstests (TLPT)",
		requirementText:
			"Von der zuständigen Behörde benannte Finanzunternehmen führen mindestens alle drei Jahre erweiterte Tests mittels bedrohungsorientierter Penetrationstests (TLPT) auf produktiven Systemen durch, die kritische oder wichtige Funktionen unterstützen; einbezogene IKT-Drittdienstleister nehmen teil. Umfang, Methodik und Testeranforderungen regelt die RTS 2025/1190; in Deutschland erfolgt die Umsetzung nach TIBER-DE.",
		guidance:
			"Nur bei Benennung durch die BaFin (tlptDesignated); sonst Negativnachweis in Form einer dokumentierten Prüfung, dass keine Benennung vorliegt. Bei Benennung: TIBER-DE-erfahrene Anbieter und Vertragsklauseln zur Teilnahme der Drittdienstleister.",
		domain: "development",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["RTS 2025/1190"],
		evidenceHints: [
			"Benennungsbescheid oder Negativnachweis",
			"TLPT-Bericht",
			"Attestierung",
		],
		relatedRequirements: ["iso27001:A.8.29", "nis2:Art.21(2)(f)"],
		recommendations: [
			{
				level: "must",
				text: "Benennungsstatus jährlich prüfen und dokumentieren; bei Benennung TLPT-Zyklus mit Terminen und Anbietern planen.",
				source: "BaFin",
				ref: "TIBER-DE",
			},
			{
				level: "could",
				text: "Auch ohne Benennung einen Red-Team-Test light alle zwei bis drei Jahre erwägen, um Erkennungs- und Reaktionsfähigkeit zu belegen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Ist das Unternehmen für TLPT benannt und wie wird das dokumentiert?",
		],
		pitfalls: [
			"TLPT pauschal als Pflicht angenommen – gilt nur für von der BaFin benannte Unternehmen.",
		],
		tools: { startup: ["NVISO", "Mandiant", "Deloitte"], scale: [] },
		sortOrder: 400,
	},
	{
		code: "Art.27",
		sectionCode: "IV",
		title: "Anforderungen an Tester",
		requirementText:
			"Für TLPT setzt das Finanzunternehmen nur Tester ein, die über höchste Eignung und Ansehen verfügen, über technische und organisatorische Fähigkeiten und nachgewiesene Erfahrung in Bedrohungsanalyse und Penetrationstests, von einer anerkannten Stelle zertifiziert sind oder formale Verhaltensregeln einhalten, eine unabhängige Zusicherung oder Prüfbericht zum Risikomanagement vorlegen und eine angemessene Berufshaftpflichtversicherung besitzen.",
		domain: "development",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Tester-Qualifikationsnachweise"],
		relatedRequirements: ["iso27001:A.5.19", "iso27001:A.8.34"],
		recommendations: [
			{
				level: "should",
				text: "Auch für reguläre Pentests Zertifizierung (z. B. OSCP, CREST), Referenzen und Haftpflicht des Anbieters im Vergabeprozess prüfen und ablegen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie wird die Qualifikation externer Tester vor Beauftragung geprüft und dokumentiert?",
		],
		sortOrder: 410,
	},
	// ───────────────────────── Kapitel V – IKT-Drittparteienrisiko ─────────────────────────
	{
		code: "Art.28(1-2)",
		sectionCode: "V",
		title: "Strategie und Richtlinie für IKT-Drittparteienrisiko",
		requirementText:
			"Das Finanzunternehmen managt IKT-Drittparteienrisiko als integralen Bestandteil des IKT-Risikomanagementrahmens nach dem Grundsatz der Verhältnismäßigkeit. Es verabschiedet eine Strategie für IKT-Drittparteienrisiko mit einer Leitlinie zur Nutzung von IKT-Dienstleistungen für kritische oder wichtige Funktionen (Inhalte nach RTS 2024/1773) und überprüft diese regelmäßig durch das Leitungsorgan; es bleibt stets vollständig für die Einhaltung aller Pflichten verantwortlich.",
		guidance:
			"Drittparteien-Richtlinie entlang der RTS-2024/1773-Phasen (Planung, Due Diligence, Vertrag, Überwachung, Exit) schreiben und jährlich von der Geschäftsleitung freigeben lassen.",
		domain: "supplier",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		legalBasisRefs: ["RTS 2024/1773"],
		evidenceHints: ["Drittparteien-Strategie", "Richtlinie nach RTS 2024/1773"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.21",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Richtlinie zur Nutzung von IKT-Drittdienstleistern für kritische oder wichtige Funktionen nach RTS 2024/1773 verabschieden und jährlich überprüfen.",
				source: "EBA GL",
				ref: "EBA/GL/2019/02",
			},
			{
				level: "should",
				text: "Kritikalitätseinstufung jedes IKT-Dienstleisters im Register mit Begründung dokumentieren.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wann hat das Leitungsorgan die Drittparteien-Strategie zuletzt überprüft?",
			"Wie werden kritische oder wichtige Funktionen bei Drittdienstleistern identifiziert?",
		],
		pitfalls: [
			"Cloud-Dienste als unkritisch eingestuft, obwohl Zahlungsabwicklung oder Custody darauf laufen.",
		],
		tools: {
			startup: ["Vanta", "Drata"],
			scale: ["OneTrust TPRM", "Mitratech Prevalent", "Panorays"],
		},
		sortOrder: 420,
	},
	{
		code: "Art.28(3)",
		sectionCode: "V",
		title: "Informationsregister und jährliche Einreichung",
		requirementText:
			"Das Finanzunternehmen führt und aktualisiert auf Unternehmens-, Teilkonsolidierungs- und Konsolidierungsebene ein Informationsregister über alle vertraglichen Vereinbarungen zur Nutzung von IKT-Dienstleistungen durch IKT-Drittdienstleister, unterscheidet nach kritischen oder wichtigen Funktionen und übermittelt es der Behörde mindestens jährlich im Format der ITS 2024/2956 (Stichtag 31.12., Einreichungsfenster 9.–30.03. als xBRL-CSV oder BaFin-Excel-Vorlage).",
		guidance:
			"Register von Beginn an in der Struktur der ITS-Templates führen (LEI, Vertrags-ID, Funktion, Kritikalität, Standorte, Unterauftragnehmer) und vor Einreichung mit den EBA-Validierungsregeln prüfen.",
		domain: "supplier",
		appliesToRoles: ["financial_entity"],
		legalBasisRefs: ["ITS 2024/2956"],
		evidenceHints: [
			"Register",
			"Validierungsprotokoll",
			"MVP-Eingangsbestätigung",
		],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.9",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Informationsregister nach ITS 2024/2956 vollständig und aktuell führen und fristgerecht im Einreichungsfenster über das MVP-Portal übermitteln.",
				source: "BaFin",
				ref: "ITS 2024/2956",
			},
			{
				level: "should",
				text: "Register-Pflege als Pflichtschritt im Vertragsprozess verankern, damit kein IKT-Vertrag ohne Registereintrag unterschrieben wird.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Enthält das Informationsregister alle IKT-Verträge inklusive SaaS-Dienste und Unterauftragnehmer?",
			"Wann wurde das Register zuletzt eingereicht und validiert?",
		],
		pitfalls: [
			"Register nur für kritische Dienstleister geführt – es sind alle IKT-Verträge zu erfassen.",
		],
		tools: {
			startup: ["BaFin-Excel-Vorlage (kostenlos)"],
			scale: [
				"Regnology",
				"Horn & Company Register-Tool",
				"mgm tp",
				"ServiceNow",
				"EBA-Validierungsregeln",
			],
		},
		sortOrder: 430,
	},
	{
		code: "Art.28(3)UA3",
		sectionCode: "V",
		title: "Vorab-Information über geplante kritische Verträge",
		requirementText:
			"Das Finanzunternehmen informiert die zuständige Behörde rechtzeitig über jede geplante vertragliche Vereinbarung über die Nutzung von IKT-Dienstleistungen zur Unterstützung kritischer oder wichtiger Funktionen sowie darüber, wenn eine Funktion kritisch oder wichtig geworden ist.",
		guidance:
			"Anzeige über das MVP-Portal vor Vertragsunterzeichnung; im Vertragsprozess als Freigabeschritt mit Nachweis der Anzeige verankern.",
		domain: "supplier",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Anzeigen", "MVP-Belege"],
		relatedRequirements: ["iso27001:A.5.19", "iso27001:A.5.31"],
		recommendations: [
			{
				level: "must",
				text: "Anzeigepflicht als Gate im Beschaffungsprozess für kritische oder wichtige Funktionen festlegen und Belege im Register verknüpfen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wurden geplante Verträge zu kritischen oder wichtigen Funktionen vorab angezeigt und ist die Anzeige belegt?",
		],
		pitfalls: [
			"Vertrag unterschrieben, Anzeige nachgereicht – die Information muss vorab erfolgen.",
		],
		tools: { startup: ["BaFin-MVP"], scale: [] },
		sortOrder: 440,
	},
	{
		code: "Art.28(4-6)",
		sectionCode: "V",
		title: "Due Diligence vor Vertragsschluss",
		requirementText:
			"Vor Abschluss einer Vereinbarung bewertet das Finanzunternehmen, ob eine kritische oder wichtige Funktion betroffen ist, ob aufsichtliche Bedingungen erfüllt sind, alle relevanten Risiken einschließlich Konzentrationsrisiko, führt eine sorgfältige Prüfung des Anbieters durch, identifiziert Interessenkonflikte und stellt sicher, dass der Dienstleister angemessene Informationssicherheitsstandards einhält – bei kritischen Funktionen die aktuellsten und höchsten Standards.",
		guidance:
			"Due-Diligence-Fragebogen je Kritikalität, Prüfung von SOC-2-/ISAE-3402-/C5-Testaten, Finanzlage und Standorten; Ergebnis als Bericht mit Freigabe durch die Drittparteien-Rolle.",
		domain: "supplier",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		evidenceHints: ["Due-Diligence-Berichte", "SOC-2-/ISAE-3402-/C5-Testate"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.21",
			"iso27001:A.5.22",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jeden Dienstleister kritischer oder wichtiger Funktionen eine dokumentierte Due Diligence vor Vertragsschluss und bei wesentlichen Änderungen durchführen.",
				source: "EBA GL",
				ref: "EBA/GL/2019/02",
			},
			{
				level: "should",
				text: "Testate (SOC 2 Typ II, ISAE 3402, C5) jährlich einholen und Ausnahmen bewerten.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Prüfschritte erfolgen vor Beauftragung eines IKT-Dienstleisters und wo sind die Ergebnisse dokumentiert?",
		],
		tools: {
			startup: ["TPRM-Tool", "SecurityScorecard (Ratings)", "BitSight"],
			scale: [],
		},
		sortOrder: 450,
	},
	{
		code: "Art.28(7-8)",
		sectionCode: "V",
		title: "Kündigungsrechte und Exit-Strategien",
		requirementText:
			"Verträge mit IKT-Drittdienstleistern enthalten Kündigungsrechte bei erheblichen Rechtsverstößen, Beeinträchtigungen der Funktionen, Schwächen im IKT-Risikomanagement des Anbieters oder wenn die Behörde das Unternehmen nicht mehr wirksam beaufsichtigen kann. Für kritische oder wichtige Funktionen bestehen Ausstiegsstrategien, die Risiken einer Unterbrechung oder Beendigung berücksichtigen, einschließlich alternativer Lösungen und getesteter Übergangspläne.",
		guidance:
			"Exit-Plan je kritischem Dienstleister: Datenexportformat, Übergangszeitraum, alternative Anbieter, Verantwortliche, Testergebnis (mindestens Tischübung); jährlich überprüfen.",
		domain: "supplier",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		evidenceHints: ["Exit-Pläne je kritischem Dienstleister"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.20",
			"iso27001:A.5.30",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Exit-Strategie mit Ausstiegsplan für jeden Dienstleister kritischer oder wichtiger Funktionen dokumentieren und jährlich testen oder reviewen.",
				source: "EBA GL",
				ref: "EBA/GL/2019/02",
			},
			{
				level: "should",
				text: "Kündigungsrechte nach Art. 28 Abs. 7 als Standardklausel in jedes DORA-Addendum aufnehmen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Exit-Pläne existieren für kritische Dienstleister und wann wurden sie getestet?",
		],
		pitfalls: [
			"Exit-Plan beschreibt nur die Kündigung, nicht die tatsächliche Migration der Daten und Prozesse.",
		],
		sortOrder: 460,
	},
	{
		code: "Art.29",
		sectionCode: "V",
		title: "Bewertung des Konzentrationsrisikos",
		requirementText:
			"Bei der Identifizierung und Bewertung des IKT-Konzentrationsrisikos berücksichtigt das Finanzunternehmen, ob eine Vereinbarung zur Unterstützung kritischer oder wichtiger Funktionen mit einem nicht leicht ersetzbaren Dienstleister geschlossen wird oder ob mehrere Vereinbarungen mit demselben Anbieter oder eng verbundenen Anbietern bestehen. Vorteile und Kosten alternativer Lösungen werden abgewogen; Unterauftragsketten in Drittländern werden einbezogen.",
		guidance:
			"Konzentrationsanalyse als Auswertung des Informationsregisters: Anbieter je kritischer Funktion, Ersetzbarkeit, Drittlandbezug; jährlich dem Leitungsorgan vorlegen.",
		domain: "supplier",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Konzentrationsanalyse"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:6.1.2",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Konzentrationsrisiko je kritischer Funktion jährlich bewerten und bei hoher Konzentration Alternativen oder Kompensationsmaßnahmen dokumentieren.",
				source: "EBA GL",
				ref: "EBA/GL/2019/02",
			},
		],
		auditQuestions: [
			"Welche kritischen Funktionen hängen von einem einzigen, schwer ersetzbaren Dienstleister ab und wie wird damit umgegangen?",
		],
		pitfalls: [
			"Hyperscaler-Konzentration (Hosting, Identity, Mail beim selben Anbieter) nicht als Konzentrationsrisiko erkannt.",
		],
		tools: { startup: ["TPRM-Tool"], scale: [] },
		sortOrder: 470,
	},
	{
		code: "Art.30",
		sectionCode: "V",
		title: "Pflichtvertragsinhalte",
		requirementText:
			"Verträge über IKT-Dienstleistungen enthalten mindestens eine klare Leistungsbeschreibung, Orte der Leistungserbringung und Datenverarbeitung, Bestimmungen zu Verfügbarkeit, Integrität und Vertraulichkeit der Daten, Zugangs- und Rückgaberechte bei Insolvenz oder Vertragsende, Leistungsbeschreibungen mit Zielvorgaben, Unterstützung bei IKT-Vorfällen, Mitwirkung bei Behörden und Kündigungsrechte. Für kritische oder wichtige Funktionen zusätzlich vollständige SLAs, Meldepflichten des Anbieters, Notfallpläne, Teilnahme an TLPT, uneingeschränkte Prüf- und Zugangsrechte sowie Exit-Strategien.",
		guidance:
			"Klausel-Checkliste nach Art. 30 Abs. 2 und 3 als Prüfprotokoll je Vertrag; bei Hyperscalern das jeweilige DORA-Addendum akzeptieren und Lücken dokumentieren.",
		domain: "supplier",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		evidenceHints: ["Vertragsklausel-Checkliste", "Vertrags-Addendum"],
		relatedRequirements: [
			"iso27001:A.5.20",
			"iso27001:A.5.19",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Jeden IKT-Vertrag gegen die Checkliste nach Art. 30 prüfen und Abweichungen als Risiko mit Entscheidung dokumentieren.",
				source: "EBA GL",
				ref: "EBA/GL/2019/02",
			},
			{
				level: "should",
				text: "Standard-DORA-Addendum für eigene Verträge vorhalten, damit Pflichtinhalte ohne Einzelverhandlung abgedeckt sind.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Enthalten die Verträge mit Dienstleistern kritischer Funktionen Prüf- und Zugangsrechte, SLAs und Exit-Regelungen?",
		],
		pitfalls: [
			"Standard-AGB eines SaaS-Anbieters akzeptiert, ohne die Pflichtinhalte nach Art. 30 zu prüfen.",
		],
		tools: {
			startup: [
				"DORA-Addenda der Hyperscaler (AWS, Microsoft, Google)",
				"Juro (Vertragsmanagement)",
				"Docusign CLM",
			],
			scale: [],
		},
		sortOrder: 480,
	},
	{
		code: "RTS2025/532",
		sectionCode: "V",
		title: "Unterauftragsvergabe bei kritischen Funktionen",
		requirementText:
			"Die Delegierte Verordnung (EU) 2025/532 legt fest, welche Elemente das Finanzunternehmen bei der Unterauftragsvergabe von IKT-Dienstleistungen zur Unterstützung kritischer oder wichtiger Funktionen bestimmen und bewerten muss: Risikobewertung der gesamten Unterauftragskette, vertragliche Bedingungen für Unterauftragnehmer, Überwachung, Informations- und Zustimmungsrechte bei wesentlichen Änderungen sowie Kündigungsrechte.",
		guidance:
			"Unterauftragnehmer kritischer Dienstleister im Informationsregister als Kette erfassen und im Vertrag ein Informations- und Widerspruchsrecht bei Änderungen der Unterauftragnehmer vereinbaren.",
		domain: "supplier",
		appliesToRoles: ["financial_entity", "agent", "ict_provider"],
		legalBasisRefs: ["RTS 2025/532"],
		evidenceHints: ["Subcontractor-Kette im Register"],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.21",
			"nis2:Art.21(2)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jeden Dienstleister kritischer oder wichtiger Funktionen die Unterauftragnehmer mit Leistung, Standort und Kritikalität erfassen und Änderungen vertraglich genehmigungspflichtig machen.",
				source: "ESMA",
				ref: "RTS 2025/532",
			},
		],
		auditQuestions: [
			"Sind die Unterauftragnehmer der kritischen Dienstleister bekannt und vertraglich adressiert?",
		],
		pitfalls: [
			"Nur der direkte Vertragspartner bekannt, die dahinterliegende Hosting-Kette nicht.",
		],
		tools: { startup: ["TPRM-Tool"], scale: [] },
		sortOrder: 490,
	},
	{
		code: "Art.31-44",
		sectionCode: "V",
		title: "Überwachung kritischer IKT-Drittdienstleister (CTPP)",
		requirementText:
			"Die ESAs benennen kritische IKT-Drittdienstleister (CTPP) und überwachen sie über ein Überwachungsrahmenwerk mit federführender Behörde, Empfehlungen und Zwangsgeldern. Finanzunternehmen bleiben für ihr Drittparteienrisiko verantwortlich, berücksichtigen Empfehlungen der Überwachungsbehörde gegenüber ihren CTPPs und können verpflichtet werden, Vereinbarungen mit nicht kooperierenden CTPPs zu beenden.",
		guidance:
			"Informationsregister jährlich mit der veröffentlichten ESA-CTPP-Liste abgleichen, Treffer kennzeichnen und Empfehlungen der Lead Overseer im Dienstleister-Review berücksichtigen.",
		domain: "supplier",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Abgleich der Dienstleister mit der ESA-CTPP-Liste"],
		relatedRequirements: ["iso27001:A.5.19", "iso27001:A.5.22"],
		recommendations: [
			{
				level: "should",
				text: "Jährlichen Abgleich des Informationsregisters mit der ESA-CTPP-Liste dokumentieren und betroffene Dienstleister im Register markieren.",
				source: "ESMA",
			},
		],
		auditQuestions: [
			"Welche der genutzten IKT-Dienstleister sind als CTPP benannt und wie werden Empfehlungen der Überwachungsbehörde berücksichtigt?",
		],
		sortOrder: 500,
	},
	// ───────────────────────── Kapitel VI – Informationsaustausch ─────────────────────────
	{
		code: "Art.45",
		sectionCode: "VI",
		title: "Austausch von Cyberbedrohungsinformationen",
		requirementText:
			"Finanzunternehmen können untereinander Informationen und Erkenntnisse über Cyberbedrohungen austauschen, einschließlich Indikatoren für Kompromittierung, Taktiken, Techniken und Verfahren sowie Warnungen und Konfigurationstools, sofern dies der Stärkung der Resilienz dient, innerhalb vertrauenswürdiger Gemeinschaften erfolgt und Geschäftsgeheimnisse, Datenschutz und Wettbewerbsrecht gewahrt bleiben. Die Teilnahme an solchen Vereinbarungen wird der zuständigen Behörde mitgeteilt.",
		guidance:
			"Teilnahme an der Allianz für Cybersicherheit oder einer Branchenplattform mit dokumentierter Vereinbarung; Anzeige der Teilnahme bei der BaFin ablegen.",
		domain: "governance",
		appliesToRoles: ["financial_entity"],
		evidenceHints: ["Teilnahmevereinbarung", "Anzeige"],
		relatedRequirements: ["iso27001:A.5.6", "iso27001:A.5.7", "nis2:Art.29"],
		recommendations: [
			{
				level: "should",
				text: "Mindestens einer vertrauenswürdigen Austauschgemeinschaft beitreten und die Teilnahme der BaFin anzeigen.",
				source: "ENISA",
			},
			{
				level: "could",
				text: "Eingehende Bedrohungsinformationen (IoCs) automatisiert ins SIEM einspeisen, z. B. über MISP.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Nimmt das Unternehmen an einem Austausch von Cyberbedrohungsinformationen teil und wurde dies der Behörde mitgeteilt?",
		],
		tools: {
			startup: ["FS-ISAC", "Allianz für Cybersicherheit", "MISP (Open Source)"],
			scale: [],
		},
		sortOrder: 510,
	},
];
