import type { CatalogControl } from "./types";

// Common Controls — der harmonisierte Satz gemeinsamer Massnahmen (das Was).
// Ein Control erfüllt über control-requirements.ts Anforderungen quer durch
// alle gewählten Rahmenwerke. Code-Präfix = Kürzel, `domain` ist das Feld
// (CC-LOG/CC-OPS → operations, CC-TST → development, CC-GOV-10/13/18/20 → compliance).
// Aufwand: S ≈ Tage, M ≈ Wochen, L ≈ Monate (eine Person).

let order = 0;
const next = () => {
	order += 10;
	return order;
};

const PART_A: CatalogControl[] = [
	// ── Governance ───────────────────────────────────────────────────────────
	{
		code: "CC-GOV-01",
		title: "Informationssicherheitsleitlinie und Themenrichtlinien",
		description:
			"Eine von der Leitung freigegebene Leitlinie legt Ziele, Grundsätze und Verantwortung für Informationssicherheit fest; themenspezifische Richtlinien (Zugang, Krypto, Betrieb, Netz, Change, Dienstleister) konkretisieren sie.",
		implementationGuidance:
			"Leitlinie auf zwei Seiten, von der Geschäftsleitung unterschrieben; Themenrichtlinien als gelenkte Dokumente mit Eigner, Review-Zyklus 12 Monate und Kenntnisnahme durch alle Mitarbeitenden.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Unterschriebene Leitlinie",
			"Richtlinienverzeichnis mit Versionen",
			"Kenntnisnahme-Quote",
		],
		recommendations: [
			{
				level: "must",
				text: "Leitlinie jährlich und nach wesentlichen Änderungen überprüfen; Freigabe durch die Geschäftsleitung dokumentieren.",
				source: "ISO 27002",
				ref: "5.1",
			},
			{
				level: "should",
				text: "Richtliniensatz an RTS 2024/1774 ausrichten (Sicherheits-, Asset-, Krypto-, Betriebs-, Netz-, Change-, IAM-Richtlinie), damit DORA-Nachweise direkt ableitbar sind.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wer hat die Leitlinie wann freigegeben und wie wurde sie kommuniziert?",
			"Welche Themenrichtlinien gibt es und wann wurden sie zuletzt überprüft?",
		],
		testMethodHint: "inspection",
		templates: ["RL-ISMS-LEITLINIE"],
		sortOrder: next(),
	},
	{
		code: "CC-GOV-02",
		title: "Rollen, Verantwortlichkeiten und Pflichtfunktionen",
		description:
			"Sicherheits- und Compliance-Rollen sind benannt, mit Vertretung besetzt und dokumentiert — einschliesslich der aufsichtlich geforderten Pflichtfunktionen (ISB, IKT-Risikofunktion, Compliance, Interne Revision, Drittanbieter-Überwachung).",
		implementationGuidance:
			"Rollenregister mit Bestellungsnachweis je Funktion; fehlende Pflichtfunktion erscheint als Lücke im Überblick.",
		domain: "governance",
		effort: "M",
		kind: "organizational",
		evidenceHints: [
			"Rollenregister",
			"Bestellungsschreiben",
			"Organigramm",
			"RACI je Prozess",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jede Pflichtfunktion eine Vertretung benennen und Interessenkonflikte (z. B. ISB = IT-Leitung) ausschliessen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wer ist ISB, wer vertritt, seit wann, mit welchem Nachweis?",
			"Ist die IKT-Risikokontrollfunktion unabhängig von der IT-Entwicklung?",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-03",
		title: "Verpflichtung und Steuerung durch die Leitung",
		description:
			"Die Geschäftsleitung trägt die Endverantwortung, genehmigt Rahmenwerk, Budget, Richtlinien und Pläne per Beschluss und lässt sich regelmässig berichten.",
		implementationGuidance:
			"Beschlussregister mit Rechtsgrundlage; jährlicher Beschluss zu Rahmenwerk, Strategie, Budget und wesentlichen Auslagerungen.",
		domain: "governance",
		effort: "S",
		kind: "organizational",
		evidenceHints: ["Beschlüsse der Geschäftsleitung", "Berichtsprotokolle"],
		recommendations: [
			{
				level: "must",
				text: "Jede Genehmigungspflicht aus DORA Art. 5 Abs. 2 als eigenen, datierten Beschluss führen — Prüfer suchen genau diese Liste.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Beschlüsse hat die Leitung im letzten Jahr zur IKT-Sicherheit gefasst?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-04",
		title: "Kontext, interessierte Parteien und Geltungsbereich",
		description:
			"Interne und externe Themen, interessierte Parteien mit ihren Anforderungen und der Geltungsbereich des Managementsystems sind dokumentiert und werden periodisch überprüft.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Kontextanalyse",
			"Stakeholder-Register",
			"(P) Scope-Dokument",
		],
		recommendations: [
			{
				level: "should",
				text: "Scope je Rahmenwerk formulieren (ISMS-Scope, DORA-Anwendungsbereich, MiCAR-Dienste) und Ausschlüsse begründen.",
				source: "ISO 27002",
			},
		],
		auditQuestions: [
			"Welche Schnittstellen und Abhängigkeiten liegen ausserhalb des Scopes und warum?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-05",
		title: "Ziele, Kennzahlen und Managementbewertung",
		description:
			"Messbare Sicherheitsziele mit Kennzahlen werden verfolgt; die Leitung bewertet das Managementsystem mindestens jährlich anhand definierter Inputs und beschliesst Massnahmen.",
		domain: "governance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"(P) Zielkatalog mit KPIs",
			"KPI-Report",
			"(P) Protokoll Management-Review",
		],
		recommendations: [
			{
				level: "must",
				text: "Alle Pflicht-Inputs der Managementbewertung (Status alter Massnahmen, Kontextänderungen, Risiko- und Auditergebnisse, Feedback, Verbesserungen) in einer Checkliste abhaken.",
				source: "ISO 27002",
				ref: "9.3",
			},
		],
		auditQuestions: [
			"Welche Kennzahlen zeigen, dass die Ziele erreicht werden?",
			"Wann war die letzte Managementbewertung und was wurde beschlossen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-06",
		title: "Internes Auditprogramm",
		description:
			"Ein mehrjähriges, risikobasiertes Auditprogramm prüft alle Domänen, kritischen Prozesse und wesentlichen Dienstleister durch unabhängige Auditor:innen; Findings werden nachverfolgt.",
		domain: "governance",
		effort: "M",
		kind: "process",
		evidenceHints: ["(P) Auditprogramm", "Auditberichte", "Findings-Tracking"],
		recommendations: [
			{
				level: "must",
				text: "Unabhängigkeit sichern: Auditor:in prüft keine Controls oder Prozesse, für die sie selbst verantwortlich ist.",
				source: "ISO 27002",
				ref: "9.2",
			},
			{
				level: "should",
				text: "Dreijahreszyklus mit jährlicher Aktualisierung — entspricht MaRisk BT 2.3 und erleichtert spätere Lizenzstufen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Deckt das Programm innerhalb des Zyklus alle Bereiche ab?",
			"Wie wird die Unabhängigkeit der Prüfenden sichergestellt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-07",
		title: "Abweichungen und kontinuierliche Verbesserung",
		description:
			"Abweichungen aus Audits, Vorfällen, Tests und Beschwerden werden erfasst, mit Ursachenanalyse behandelt und auf Wirksamkeit geprüft (CAPA-Regelkreis).",
		domain: "governance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Abweichungsregister",
			"(P) Nachweis Nichtkonformitäten und Korrekturen",
			"Wirksamkeitsprüfungen",
		],
		recommendations: [
			{
				level: "must",
				text: "Jeder schwerwiegende Vorfall erzeugt automatisch eine Abweichung mit Root-Cause-Pflichtfeld und Wirksamkeitsprüfung nach 90 Tagen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie fliessen Lessons Learned aus Vorfällen in Korrekturmassnahmen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-08",
		title: "Dokumentenlenkung",
		description:
			"Gelenkte Dokumente haben Nummer, Eigner, Freigeber, Version, Gültigkeit und Review-Zyklus; Freigaben laufen über definierte Workflows mit Vier-Augen-Prinzip, Änderungen sind nachvollziehbar.",
		domain: "governance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"(P) Dokumentenlenkungsregel",
			"Dokumentenregister",
			"Versionshistorie mit Freigaben",
		],
		recommendations: [
			{
				level: "must",
				text: "Freigeber:in ungleich Autor:in; Veröffentlichung setzt Kenntnisnahmen zurück.",
				source: "ISO 27002",
				ref: "7.5",
			},
		],
		auditQuestions: [
			"Zeigen Sie die Versionshistorie und Freigabekette einer beliebigen Richtlinie.",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-09",
		title: "Kommunikationsmatrix und Behördenkontakte",
		description:
			"Wer kommuniziert was, wann, an wen und über welchen Kanal — intern, an Kunden, Partner und Behörden (BaFin, Bundesbank, BSI, FIU, Datenschutzaufsicht, Polizei) — ist festgelegt und aktuell.",
		domain: "governance",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Kommunikationsmatrix", "Behördenliste", "security.txt"],
		recommendations: [
			{
				level: "should",
				text: "Krisenkontakte zusätzlich offline (PDF) vorhalten; Aktualität in jeder BCM-Übung prüfen.",
				source: "BSI IT-Grundschutz",
				ref: "DER.4",
			},
		],
		auditQuestions: [
			"Wer meldet einen schwerwiegenden Vorfall an die BaFin und über welchen Kanal?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-10",
		title: "Rechtskataster und regulatorisches Monitoring",
		description:
			"Alle einschlägigen Gesetze, Verordnungen, Rundschreiben und Verträge sind mit Verantwortlichen erfasst; Änderungen werden systematisch beobachtet und in Massnahmen übersetzt.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Rechtskataster mit Verantwortlichen",
			"Änderungsprotokoll",
			"Regulatorischer Kalender",
		],
		recommendations: [
			{
				level: "should",
				text: "Kommende Rechtsänderungen (AMLR 10.07.2027, BAIT-Ende, PSD3) sechs Monate vorher als Aufgabe terminieren.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie erfahren Sie von neuen aufsichtlichen Anforderungen und wer bewertet sie?",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-11",
		title: "Aufgabentrennung",
		description:
			"Unvereinbare Aufgaben (Entwicklung/Freigabe, Zahlungsauslösung/Freigabe, ISB/IT-Leitung, Vertrieb/Händlerfreigabe) sind getrennt oder durch kompensierende Kontrollen abgesichert.",
		domain: "governance",
		effort: "M",
		kind: "organizational",
		evidenceHints: [
			"SoD-Matrix",
			"Vier-Augen-Nachweise",
			"Ausnahmen mit Begründung",
		],
		recommendations: [
			{
				level: "must",
				text: "Vier-Augen-Prinzip bei jeder Geldbewegung und jeder Richtlinienfreigabe technisch erzwingen, nicht nur anweisen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Funktionstrennungen gelten und wie werden Verstösse erkannt?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-12",
		title: "Sicherheit in Projekten und geplante ISMS-Änderungen",
		description:
			"Projekte und Änderungen am Managementsystem berücksichtigen Sicherheitsanforderungen von Anfang an; Änderungen werden geplant, bewertet und dokumentiert.",
		domain: "governance",
		effort: "S",
		kind: "process",
		evidenceHints: ["Projekt-Sicherheitscheckliste", "Change-Protokoll ISMS"],
		auditQuestions: [
			"Wie wird Sicherheit in Projekten berücksichtigt und wer prüft das?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-13",
		title: "Unabhängige Überprüfung und Compliance-Checks",
		description:
			"Die Einhaltung von Richtlinien und Normen wird regelmässig unabhängig überprüft (extern und intern); Audit-Tests selbst sind so geplant, dass sie den Betrieb nicht gefährden.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Externe Auditberichte",
			"Compliance-Checks",
			"Audit-Zugriffsregeln",
		],
		auditQuestions: [
			"Wann wurde das ISMS zuletzt unabhängig überprüft und mit welchem Ergebnis?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-14",
		title: "Ressourcen und Budget für Informationssicherheit",
		description:
			"Personal, Budget und Werkzeuge für das Managementsystem sind geplant, von der Leitung freigegeben und reichen für die festgelegten Ziele aus.",
		domain: "governance",
		effort: "S",
		kind: "organizational",
		evidenceHints: ["Budget- und Personalplan", "IKT-Budget-Beschluss"],
		auditQuestions: [
			"Wie wurde das Sicherheitsbudget bemessen und freigegeben?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-15",
		title: "Strategie für digitale operationale Resilienz",
		description:
			"Eine dokumentierte Strategie legt Toleranzschwellen, Resilienzziele, Zielarchitektur, Kennzahlen und den Umgang mit Drittparteien fest und wird jährlich fortgeschrieben.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Resilienzstrategie",
			"Beschluss der Leitung",
			"Kennzahlenbericht",
		],
		recommendations: [
			{
				level: "must",
				text: "Strategie an Geschäfts- und Risikostrategie koppeln; Kennzahlen (RTO-Einhaltung, Patch-Zeit, Vorfallzahlen) quartalsweise berichten.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Toleranzschwellen für Störungen hat die Leitung festgelegt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-16",
		title: "Schulung des Leitungsorgans",
		description:
			"Die Geschäftsleitung wird regelmässig zu IKT-Risiken, Cybersicherheit und ihren aufsichtlichen Pflichten geschult; Teilnahme ist belegt.",
		domain: "governance",
		effort: "S",
		kind: "process",
		evidenceHints: ["Schulungsnachweise der Geschäftsleitung", "Schulungsplan"],
		recommendations: [
			{
				level: "must",
				text: "Mindestens jährlich; Inhalte an aktuellen Vorfällen und Rechtsänderungen ausrichten.",
				source: "ENISA",
			},
		],
		auditQuestions: [
			"Wann wurde die Leitung zuletzt zu IKT-Risiken geschult, mit welchem Inhalt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-17",
		title: "Kontakt zu Interessengruppen und Informationsaustausch",
		description:
			"Die Organisation pflegt Kontakte zu Fachgremien, CERTs und Branchenverbünden und beteiligt sich am Austausch von Bedrohungsinformationen.",
		domain: "governance",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"Mitgliedschaften",
			"Teilnahmevereinbarung",
			"Anzeige an die Behörde",
		],
		recommendations: [
			{
				level: "could",
				text: "Allianz für Cybersicherheit (kostenlos) und CERT-Bund-Warnungen als Einstieg; FS-ISAC bei Skalierung.",
				source: "BSI IT-Grundschutz",
			},
		],
		auditQuestions: [
			"In welchen Austauschformaten ist die Organisation aktiv?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-18",
		title: "Betroffenheitsprüfung und Registrierung (NIS2/BSIG)",
		description:
			"Die Betroffenheit nach NIS2/BSIG ist geprüft und dokumentiert (inkl. lex-specialis-Begründung zu DORA); bei Betroffenheit ist die Registrierung beim BSI erfolgt und wird aktuell gehalten.",
		domain: "compliance",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Betroffenheitsanalyse",
			"Dokumentierte Ausnahmebegründung",
			"Registrierungsbestätigung BSI",
		],
		recommendations: [
			{
				level: "must",
				text: "Prüfung vor Produktdesign wiederholen, wenn Dritten IKT-Dienste angeboten werden (Anlage 1 BSIG, Managed Services).",
				source: "intern",
			},
		],
		auditQuestions: [
			"Liegt eine dokumentierte Betroffenheitsprüfung vor und wer hat sie wann aktualisiert?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-19",
		title: "Unabhängige IKT-Risikokontrollfunktion",
		description:
			"Eine von der IT-Entwicklung und dem Betrieb unabhängige Kontrollfunktion überwacht das IKT-Risiko (zweite Verteidigungslinie); die Interne Revision bildet die dritte Linie.",
		domain: "governance",
		effort: "M",
		kind: "organizational",
		evidenceHints: [
			"Funktionsbeschreibung",
			"Organigramm mit drei Linien",
			"Berichtslinien",
		],
		recommendations: [
			{
				level: "should",
				text: "In kleinen Instituten darf die Funktion mit Compliance kombiniert, aber nicht mit der IT-Leitung besetzt sein.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"An wen berichtet die IKT-Risikokontrollfunktion und wie ist sie von der IT getrennt?",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-20",
		title: "Mapping aufsichtlicher Konkretisierungen auf Richtlinien",
		description:
			"Technische Regulierungs- und Durchführungsstandards (RTS/ITS) sowie BaFin-Rundschreiben sind auf die eigenen Richtlinien und Controls gemappt; Lücken sind sichtbar.",
		domain: "compliance",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Mapping RTS → Richtlinien", "Lückenliste"],
		auditQuestions: [
			"Wo ist nachvollziehbar, welche Richtlinie RTS 2024/1774 Art. x umsetzt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Risiko ───────────────────────────────────────────────────────────────
	{
		code: "CC-RSK-01",
		title: "Risikomanagement-Methodik und Akzeptanzkriterien",
		description:
			"Eine dokumentierte Methode definiert Skalen für Eintrittswahrscheinlichkeit und Auswirkung, Risikoappetit, Akzeptanzschwellen und Zuständigkeiten für die Risikobehandlung.",
		domain: "risk",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"(P) Risikobeurteilungsmethodik",
			"Risikoappetit-Beschluss",
		],
		recommendations: [
			{
				level: "must",
				text: "Appetit als Zahl festlegen (akzeptabel ≤ 4, tolerierbar ≤ 9 auf der 5×5-Matrix) und von der Leitung beschliessen lassen.",
				source: "ISO 27002",
				ref: "ISO 27005",
			},
		],
		auditQuestions: [
			"Welche Kriterien entscheiden, ob ein Risiko akzeptiert werden darf?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-02",
		title: "Risikobeurteilung und Risikoregister",
		description:
			"Informationssicherheits- und IKT-Risiken werden asset- und prozessbezogen identifiziert, bewertet, mit Verantwortlichen im Register geführt und turnusmässig neu bewertet.",
		domain: "risk",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Risikoregister",
			"(P) Ergebnisse der Risikobeurteilung",
			"Risikomatrix",
		],
		recommendations: [
			{
				level: "should",
				text: "Mindestens quartalsweise Review der Top-Risiken; Risiken über Appetit erzeugen eine Benachrichtigung an den Owner.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Risiken liegen aktuell über dem Appetit und was wird dagegen getan?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-03",
		title: "Risikobehandlungsplan und Erklärung zur Anwendbarkeit",
		description:
			"Für jedes Risiko ist die Behandlung (mindern, akzeptieren, übertragen, vermeiden) mit Massnahmen und Terminen festgelegt; die Erklärung zur Anwendbarkeit begründet gewählte und ausgeschlossene Controls.",
		domain: "risk",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"(P) Erklärung zur Anwendbarkeit (SoA)",
			"(P) Risikobehandlungsplan",
			"Massnahmenstatus",
		],
		recommendations: [
			{
				level: "must",
				text: "Jede Nicht-Anwendbarkeit begründen (Dienst nicht erbracht, lex specialis, kompensierendes Control) — leere Begründungen sind der häufigste Zertifizierungsbefund.",
				source: "ISO 27002",
			},
		],
		auditQuestions: [
			"Welche Controls sind ausgeschlossen und mit welcher Begründung?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-04",
		title: "Jährliche Überprüfung des IKT-Risikorahmens",
		description:
			"Der IKT-Risikomanagementrahmen wird mindestens jährlich sowie nach schwerwiegenden Vorfällen und Prüfungsfeststellungen überprüft; der Bericht steht der Aufsicht auf Anfrage zur Verfügung.",
		domain: "risk",
		effort: "S",
		kind: "process",
		evidenceHints: ["Review-Protokoll", "Änderungshistorie des Rahmenwerks"],
		auditQuestions: [
			"Wann wurde der Rahmen zuletzt überprüft und was hat sich geändert?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-05",
		title: "Bedrohungsintelligenz",
		description:
			"Informationen über Bedrohungen und Schwachstellen werden systematisch gesammelt, bewertet und in Risiken, Erkennungsregeln und Massnahmen übersetzt.",
		domain: "risk",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Threat-Intel-Prozess",
			"Quellenliste",
			"Bewertungsprotokolle",
		],
		recommendations: [
			{
				level: "could",
				text: "CERT-Bund-Warnungen und Hersteller-Advisories als Pflichtquellen; Blockchain-Analytics-Feeds bei Krypto-Diensten.",
				source: "BSI IT-Grundschutz",
			},
		],
		auditQuestions: [
			"Welche Bedrohungsquellen werden ausgewertet und wie fliessen sie in Massnahmen?",
		],
		testMethodHint: "interview",
		sortOrder: next(),
	},

	// ── Assets & Informationen ───────────────────────────────────────────────
	{
		code: "CC-AST-01",
		title: "Asset-Inventar mit Verantwortlichen",
		description:
			"Alle Informationswerte, Systeme, Anwendungen, Dienste, Geräte und Schlüsselmaterial sind inventarisiert, klassifiziert und einer verantwortlichen Person zugeordnet.",
		domain: "asset",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Asset-Inventar",
			"Verantwortliche je Asset",
			"Letzte Inventur",
		],
		recommendations: [
			{
				level: "must",
				text: "Kein Asset ohne Owner; Inventar mindestens jährlich abgleichen (Cloud-Konten automatisiert).",
				source: "ISO 27002",
				ref: "5.9",
			},
		],
		auditQuestions: [
			"Wie vollständig und aktuell ist das Inventar, wer pflegt es?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-02",
		title: "Klassifizierung und Kennzeichnung von Informationen",
		description:
			"Informationen werden nach Schutzbedarf klassifiziert (öffentlich, intern, vertraulich, geheim) und entsprechend gekennzeichnet; Handhabungsregeln je Klasse sind definiert.",
		domain: "asset",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Klassifizierungsschema", "Labeling-Regeln", "Stichproben"],
		auditQuestions: [
			"Welche Klassen gibt es und wie wird ein vertrauliches Dokument behandelt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-03",
		title: "Zulässiger Gebrauch und Rückgabe von Werten",
		description:
			"Regeln für den zulässigen Gebrauch von Informationen und Geräten sind festgelegt; bei Austritt oder Rollenwechsel werden Werte zurückgegeben und Zugänge entzogen.",
		domain: "asset",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Acceptable Use Policy", "Austrittscheckliste"],
		auditQuestions: [
			"Wie wird sichergestellt, dass Ausscheidende alle Werte zurückgeben?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-04",
		title: "Abhängigkeitskarte: Funktionen, Systeme, Dienstleister",
		description:
			"Geschäftsfunktionen sind mit den unterstützenden Systemen, Daten und Dienstleistern verknüpft; kritische oder wichtige Funktionen und ihre Abhängigkeiten sind identifiziert.",
		domain: "asset",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Prozess-System-Dienstleister-Mapping",
			"Liste kritischer Funktionen",
		],
		recommendations: [
			{
				level: "must",
				text: "Abhängigkeitskarte aus Prozess-, Asset- und Dienstleister-Register generieren statt separat pflegen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Dienstleister stützen Ihre kritischen Funktionen und wo steht das?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-05",
		title: "Lizenz- und IP-Verzeichnis",
		description:
			"Software-Lizenzen und Rechte an geistigem Eigentum sind erfasst; Lizenzbedingungen werden eingehalten.",
		domain: "asset",
		effort: "S",
		kind: "process",
		evidenceHints: ["Lizenzverzeichnis", "SBOM"],
		auditQuestions: [
			"Wie wird die Lizenzkonformität von Open-Source-Komponenten geprüft?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-06",
		title: "Jährliche Bewertung von Altsystemen",
		description:
			"Altsysteme (Legacy) sind markiert und werden mindestens jährlich auf Risiken, Herstellersupport und Ablöseoptionen bewertet.",
		domain: "asset",
		effort: "S",
		kind: "process",
		evidenceHints: ["Legacy-Risikobewertung", "Ablöseplan"],
		auditQuestions: [
			"Welche Systeme gelten als Legacy und wann wurden sie zuletzt bewertet?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-07",
		title: "Regeln für die Informationsübertragung",
		description:
			"Übertragungswege für Informationen (E-Mail, Dateiaustausch, APIs, Messenger) sind nach Klassifizierung geregelt und abgesichert.",
		domain: "asset",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Übertragungsrichtlinie", "Freigegebene Werkzeuge"],
		auditQuestions: ["Über welche Kanäle dürfen vertrauliche Daten verlassen?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-08",
		title: "Datenmaskierung und Testdaten",
		description:
			"Produktivdaten werden für Test und Entwicklung maskiert oder synthetisch erzeugt; Testdaten sind geschützt und werden nach Gebrauch gelöscht.",
		domain: "asset",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Testdatenrichtlinie", "Maskierungsregeln"],
		auditQuestions: [
			"Enthalten Test- und Entwicklungsumgebungen echte Kundendaten?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AST-09",
		title: "Verhinderung von Datenabfluss",
		description:
			"Technische und organisatorische Massnahmen verhindern den unbefugten Abfluss klassifizierter Daten (Export-Limits, Alarme, Verschlüsselung, Kanalbeschränkungen).",
		domain: "asset",
		effort: "M",
		kind: "technical",
		evidenceHints: ["DLP-Regeln", "Export-Alarme", "Auditierte Downloads"],
		auditQuestions: [
			"Wie würden Sie einen Massenexport von Kundendaten bemerken?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-AST-10",
		title: "Aufbewahrungs- und Löschkonzept",
		description:
			"Aufbewahrungsfristen (GwG 5 Jahre, HGB 10 Jahre, DSGVO-Löschpflichten) und Löschverfahren sind je Datenkategorie festgelegt; Aufzeichnungen sind vor Verlust und Veränderung geschützt.",
		domain: "asset",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Aufbewahrungs-/Löschkonzept",
			"Löschprotokolle",
			"WORM-/Object-Lock-Nachweis",
		],
		recommendations: [
			{
				level: "must",
				text: "Audit-Log und GwG-pflichtige Aufzeichnungen von jeder automatischen Löschung ausnehmen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Fristen gelten je Datenkategorie und wie wird die Löschung nachgewiesen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Identität & Zugang ───────────────────────────────────────────────────
	{
		code: "CC-IAM-01",
		title: "Zugangssteuerungsrichtlinie und Berechtigungskonzept",
		description:
			"Zugriff auf Informationen und Systeme folgt Need-to-know und Least Privilege; Rollen, Berechtigungen und Genehmigungswege sind in einem Berechtigungskonzept festgelegt und technisch (z. B. per Row-Level-Security) durchgesetzt.",
		domain: "access",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Zugangsrichtlinie",
			"Berechtigungskonzept",
			"Rollenmodell",
		],
		recommendations: [
			{
				level: "must",
				text: "Mandantentrennung in der Datenbank erzwingen (RLS), nicht nur in der Anwendung.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie wird verhindert, dass ein Mandant Daten eines anderen sieht — auch bei Programmierfehlern?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-02",
		title: "Identitätslebenszyklus (Joiner – Mover – Leaver)",
		description:
			"Konten werden bei Eintritt beantragt und genehmigt, bei Rollenwechsel angepasst und bei Austritt unverzüglich gesperrt; Sitzungen werden widerrufen.",
		domain: "access",
		effort: "M",
		kind: "process",
		evidenceHints: ["JML-Prozess", "Sperrprotokolle", "Offboarding-Checkliste"],
		recommendations: [
			{
				level: "must",
				text: "Entfernen eines Mitglieds widerruft alle aktiven Sitzungen sofort.",
				source: "ISO 27002",
				ref: "5.16",
			},
		],
		auditQuestions: ["Wie schnell ist ein Ausscheidender technisch gesperrt?"],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-03",
		title: "Starke Authentisierung",
		description:
			"Alle Nutzer:innen authentisieren sich mit mindestens zwei Faktoren (TOTP, Passkeys/FIDO2); Authentisierungsinformationen werden sicher erzeugt, gespeichert und zurückgesetzt.",
		domain: "access",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"MFA-Quote",
			"Passwort-/MFA-Richtlinie",
			"Lockout-Konfiguration",
		],
		recommendations: [
			{
				level: "must",
				text: "MFA für alle Rollen erzwingen (auch Lesende); Passkeys bevorzugen; Lockout nach 5 Fehlversuchen.",
				source: "BSI IT-Grundschutz",
				ref: "ORP.4",
			},
		],
		auditQuestions: [
			"Gibt es Konten ohne MFA? Wie wird ein Lockout behandelt?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-04",
		title: "Privilegierte Zugänge",
		description:
			"Administrative Zugänge sind personalisiert, zeitlich begrenzt, zusätzlich geschützt (MFA, IP-Allowlist, Just-in-time) und werden protokolliert und rezertifiziert.",
		domain: "access",
		effort: "M",
		kind: "technical",
		evidenceHints: ["PAM-Konzept", "Liste privilegierter Konten", "Protokolle"],
		recommendations: [
			{
				level: "must",
				text: "Plattform-Admin-Zugriff nur mit Passkey, aus Allowlist-IPs und mit Begründung im Audit-Log.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wer hat Admin-Rechte in Produktion und wie wird das überwacht?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-05",
		title: "Rezertifizierung von Zugriffsrechten",
		description:
			"Zugriffsrechte werden regelmässig (mindestens quartalsweise für kritische Systeme) durch die Verantwortlichen überprüft und bestätigt oder entzogen.",
		domain: "access",
		effort: "S",
		kind: "process",
		evidenceHints: ["Rezertifizierungsprotokolle", "Entzogene Rechte"],
		auditQuestions: [
			"Wann war die letzte Rezertifizierung und was wurde entzogen?",
		],
		testMethodHint: "access_review",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-06",
		title: "Zugriff auf Quellcode und Repositories",
		description:
			"Lese- und Schreibzugriff auf Quellcode, Build-Pipelines und Secrets ist auf berechtigte Personen beschränkt; Änderungen am Hauptzweig erfordern Review und Branch-Schutz.",
		domain: "access",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Repository-Berechtigungen", "Branch-Protection-Regeln"],
		auditQuestions: ["Wer kann ohne Review nach Produktion deployen?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-07",
		title: "Remote-Arbeit und Zero Trust",
		description:
			"Zugriff von ausserhalb erfolgt nur über gehärtete Geräte, starke Authentisierung und kontextabhängige Richtlinien; interne Netze gelten nicht als vertrauenswürdig.",
		domain: "access",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Remote-Work-Richtlinie", "Zero-Trust-Konfiguration"],
		auditQuestions: [
			"Welche Voraussetzungen muss ein Gerät für den Zugriff erfüllen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-IAM-08",
		title: "Sitzungsregeln und Step-up-Authentisierung",
		description:
			"Sitzungen laufen nach Inaktivität (30 min) und absolut (12 h) ab; sensible Aktionen (Freigaben, Exporte, Mitglieder, Einstellungen, vertrauliche Downloads) verlangen eine frische zweite Bestätigung.",
		domain: "access",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Session-Konfiguration", "Step-up-Nachweise im Audit-Log"],
		auditQuestions: ["Welche Aktionen verlangen eine erneute Authentisierung?"],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},

	// ── Kryptografie ─────────────────────────────────────────────────────────
	{
		code: "CC-CRY-01",
		title: "Verschlüsselung ruhender Daten",
		description:
			"Vertrauliche Daten und Dateien sind im Ruhezustand mit anerkannten Verfahren verschlüsselt (z. B. XChaCha20-Poly1305/AES-GCM); Datenträger und Backups eingeschlossen.",
		domain: "crypto",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Kryptokonzept",
			"Konfiguration der Verschlüsselung",
			"Backup-Verschlüsselung",
		],
		recommendations: [
			{
				level: "must",
				text: "Nachweise und Dokumente je Mandant mit eigenem Schlüssel verschlüsseln (Envelope), damit Löschung per Crypto-Shredding möglich ist.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Daten sind verschlüsselt, mit welchem Verfahren, wo liegen die Schlüssel?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CRY-02",
		title: "Feld- und Mandantenverschlüsselung sensibler Daten",
		description:
			"Besonders sensible Felder (Hinweisgeber, Verdachtsmeldungen, Fit-&-Proper-Daten, Betroffenenanfragen) sind zusätzlich auf Feldebene mit dem Mandantenschlüssel verschlüsselt.",
		domain: "crypto",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Liste feldverschlüsselter Spalten",
			"Schlüsselversion je Mandant",
		],
		auditQuestions: [
			"Welche Felder bleiben bei einem Datenbank-Dump unlesbar?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CRY-03",
		title: "Schlüsselmanagement und Rotation",
		description:
			"Schlüssel werden sicher erzeugt, ausserhalb der Datenbank verwahrt (KMS/HSM oder Betriebssystem-Credentials), versioniert, rotiert und bei Kompromittierung ersetzt.",
		domain: "crypto",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Schlüsselinventar",
			"Rotationsprotokolle",
			"KEK-Verwahrung",
		],
		recommendations: [
			{
				level: "should",
				text: "Schlüsselversion ab Tag 1 mitführen, damit Rotation ohne Big-Bang möglich ist; HSM/KMS spätestens mit Lizenzstufe 2.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie oft werden Schlüssel rotiert und wer hat Zugriff auf den KEK?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CRY-04",
		title: "Kryptokonzept",
		description:
			"Ein Kryptokonzept legt zugelassene Algorithmen, Schlüssellängen, Protokolle, Einsatzfälle und das Schlüsselmanagement fest und wird gegen den Stand der Technik überprüft.",
		domain: "crypto",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Kryptokonzept", "Algorithmen-Allowlist"],
		recommendations: [
			{
				level: "should",
				text: "BSI TR-02102 als Referenz für Algorithmen und Schlüssellängen.",
				source: "BSI IT-Grundschutz",
				ref: "TR-02102",
			},
		],
		auditQuestions: [
			"Welche Algorithmen sind erlaubt und wer entscheidet über Ausnahmen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CRY-05",
		title: "Transportverschlüsselung",
		description:
			"Alle Verbindungen sind mit TLS 1.2+/1.3 verschlüsselt (HSTS, moderne Cipher-Suites, OCSP-Stapling); interne Verbindungen und Datenbankzugriffe sind ebenfalls geschützt.",
		domain: "crypto",
		effort: "S",
		kind: "technical",
		evidenceHints: ["TLS-Konfiguration", "SSL-Labs-Ergebnis", "HSTS-Preload"],
		auditQuestions: ["Welche TLS-Versionen und Cipher-Suites sind erlaubt?"],
		testMethodHint: "automated",
		sortOrder: next(),
	},

	// ── Physisch ─────────────────────────────────────────────────────────────
	{
		code: "CC-PHY-01",
		title: "Sicherheitszonen, Zutritt und Überwachung",
		description:
			"Standorte sind in Sicherheitszonen eingeteilt; Zutritt ist personalisiert, protokolliert und überwacht; Besucher werden begleitet.",
		domain: "physical",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Zonenkonzept",
			"Zutrittsprotokolle",
			"RZ-Testat des Betreibers",
		],
		recommendations: [
			{
				level: "should",
				text: "Bei Cloud-/Colocation-Betrieb den Nachweis über ISO-27001-/EN-50600-Testate des Rechenzentrums führen.",
				source: "ISO 27002",
			},
		],
		auditQuestions: [
			"Wer hat Zutritt zu Serverräumen und wie wird das protokolliert?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PHY-02",
		title: "Standortrisiken, Versorgung und Verkabelung",
		description:
			"Physische Bedrohungen (Feuer, Wasser, Stromausfall) sind bewertet; Versorgung (USV, Klima) und Verkabelung sind geschützt und redundant, soweit kritisch.",
		domain: "physical",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"Standort-Risikoanalyse",
			"USV-Nachweise",
			"Netzplan",
			"RZ-Testat",
		],
		auditQuestions: [
			"Welche Standortrisiken wurden bewertet und wie sind sie abgedeckt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PHY-03",
		title: "Regeln für Sicherheitsbereiche und Arbeitsplätze",
		description:
			"Regeln für das Arbeiten in Sicherheitsbereichen (Tresor-/Schlüsselraum), aufgeräumte Arbeitsplätze und Bildschirme sowie die sichere Platzierung von Geräten sind festgelegt.",
		domain: "physical",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Clean-Desk-Richtlinie",
			"Regeln Sicherheitsbereiche",
			"Aufstellungsplan",
		],
		auditQuestions: [
			"Welche Regeln gelten im Schlüsselraum und wer kontrolliert sie?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PHY-04",
		title: "Mobile Geräte und Speichermedien",
		description:
			"Geräte ausserhalb der Räumlichkeiten und Speichermedien sind verschlüsselt, zentral verwaltet und können aus der Ferne gesperrt oder gelöscht werden.",
		domain: "physical",
		effort: "S",
		kind: "technical",
		evidenceHints: [
			"Richtlinie mobile Geräte",
			"Verschlüsselungsnachweis",
			"MDM-Report",
		],
		auditQuestions: ["Sind alle Laptops vollverschlüsselt und fernlöschbar?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PHY-05",
		title: "Instandhaltung und sichere Entsorgung",
		description:
			"Geräte werden kontrolliert gewartet; Datenträger werden vor Entsorgung oder Wiederverwendung zertifiziert gelöscht oder vernichtet.",
		domain: "physical",
		effort: "S",
		kind: "process",
		evidenceHints: ["Wartungsprotokolle", "Löschzertifikate (DIN 66399)"],
		auditQuestions: [
			"Wie wird die Datenlöschung ausgemusterter Geräte nachgewiesen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
];

const PART_B: CatalogControl[] = [
	// ── Betrieb ──────────────────────────────────────────────────────────────
	{
		code: "CC-OPS-01",
		title: "Endgeräte-Härtung und Geräteverwaltung",
		description:
			"Endgeräte sind zentral verwaltet (MDM), gehärtet, vollverschlüsselt, mit automatischen Updates und Bildschirmsperre konfiguriert.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Härtungs-/MDM-Richtlinie",
			"Compliance-Report der Geräteverwaltung",
		],
		auditQuestions: [
			"Wie viele Geräte erfüllen die Baseline nicht und was passiert dann?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-02",
		title: "Schutz gegen Schadsoftware",
		description:
			"Alle Endgeräte und Server sind durch EDR/Antimalware geschützt; Erkennungen werden zentral gemeldet und bearbeitet.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: ["EDR-Abdeckung", "Alarmbearbeitung"],
		auditQuestions: ["Welche Systeme sind nicht durch EDR abgedeckt?"],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-03",
		title: "Schwachstellen- und Patchmanagement",
		description:
			"Schwachstellen werden regelmässig erkannt (Scans, Advisories, Abhängigkeitsprüfung), nach Kritikalität bewertet und innerhalb definierter Fristen behoben; Notfall-Patches sind geregelt.",
		domain: "operations",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Scan-Berichte",
			"Patch-SLAs",
			"Offene Schwachstellen nach Alter",
		],
		recommendations: [
			{
				level: "must",
				text: "Kritische Schwachstellen in extern erreichbaren Systemen innerhalb von 72 Stunden schliessen; Abweichungen als Ausnahme mit Risiko führen.",
				source: "BSI IT-Grundschutz",
				ref: "OPS.1.1.3",
			},
		],
		auditQuestions: ["Wie alt ist die älteste offene kritische Schwachstelle?"],
		testMethodHint: "vuln_scan",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-04",
		title: "Konfigurationsmanagement und Härtungs-Baselines",
		description:
			"Systeme werden nach dokumentierten Baselines (z. B. CIS) konfiguriert; Konfigurationen sind versioniert (Infrastructure as Code) und Abweichungen werden erkannt.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Baselines", "IaC-Repository", "Drift-Reports"],
		auditQuestions: [
			"Woran erkennen Sie, dass ein Server von der Baseline abweicht?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-05",
		title: "Kapazitäts- und Verfügbarkeitsüberwachung",
		description:
			"Kapazität, Performance und Verfügbarkeit werden überwacht (Health-Checks, Metriken, Alarme); Kapazitätsplanung berücksichtigt Wachstum und Spitzen.",
		domain: "operations",
		effort: "S",
		kind: "process",
		evidenceHints: [
			"Monitoring-Dashboards",
			"Kapazitätsplanung",
			"Uptime-Berichte",
		],
		auditQuestions: [
			"Wie wird ein Ausfall ausserhalb der Arbeitszeit bemerkt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-06",
		title: "Software-Installation und Whitelisting",
		description:
			"Nur freigegebene Software darf installiert werden; Installation ist auf berechtigte Rollen beschränkt und wird protokolliert.",
		domain: "operations",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Freigabeliste", "Installationsrichtlinie"],
		auditQuestions: ["Können Mitarbeitende beliebige Software installieren?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-07",
		title: "Privilegierte Hilfsprogramme",
		description:
			"Werkzeuge, die Sicherheitsmechanismen umgehen könnten (Debugger, Netzwerk-Sniffer, Datenbank-Shells), sind auf berechtigte Personen beschränkt und ihr Einsatz ist nachvollziehbar.",
		domain: "operations",
		effort: "S",
		kind: "technical",
		evidenceHints: [
			"Freigabeliste privilegierter Werkzeuge",
			"Nutzungsprotokolle",
		],
		auditQuestions: ["Wer darf direkt auf die Produktionsdatenbank zugreifen?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-08",
		title: "Dokumentierte Betriebsabläufe",
		description:
			"Wiederkehrende Betriebsabläufe (Deploy, Backup, Restore, Rotation, Vorfallreaktion) sind als Runbooks dokumentiert, versioniert und erprobt.",
		domain: "operations",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Runbooks", "Betriebshandbuch", "Deploy-Runbook"],
		auditQuestions: [
			"Könnte eine neue Kollegin das Restore nach Runbook durchführen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-09",
		title: "Zeitsynchronisation",
		description:
			"Alle Systeme synchronisieren ihre Uhren mit vertrauenswürdigen Zeitquellen, damit Protokolle korrelierbar und beweiskräftig sind.",
		domain: "operations",
		effort: "S",
		kind: "technical",
		evidenceHints: ["NTP-Konfiguration", "Zeitquellen"],
		auditQuestions: [
			"Welche Zeitquelle nutzen Server und wie wird Drift erkannt?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-OPS-10",
		title: "Sandboxing und Härtung der Laufzeitumgebung",
		description:
			"Anwendungsprozesse laufen mit minimalen Rechten in isolierten Umgebungen (dedizierter Benutzer, Dateisystem read-only, Syscall-Filter, keine neuen Privilegien); Secrets werden nicht in Dateien oder Umgebungsvariablen abgelegt.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"systemd-Unit mit Sandbox-Direktiven",
			"systemd-analyze security",
			"Credential-Verwahrung",
		],
		recommendations: [
			{
				level: "should",
				text: "Ziel systemd-analyze security ≤ 2.0; Secrets über LoadCredentialEncrypted statt EnvironmentFile.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Mit welchen Rechten läuft der Anwendungsprozess und wo liegen die Secrets?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},

	// ── Protokollierung & Überwachung ────────────────────────────────────────
	{
		code: "CC-LOG-01",
		title: "Manipulationssicheres Audit-Logging",
		description:
			"Sicherheitsrelevante Ereignisse (Anmeldungen, Rechteänderungen, Freigaben, Zugriffe auf Nachweise, Administration) werden mit Akteur, Zeit, Herkunft und Ergebnis protokolliert; das Protokoll ist append-only und per Hash-Kette gegen Veränderung geschützt.",
		domain: "operations",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Audit-Log-Export",
			"Kettenprüfung",
			"Append-only-Nachweis (Trigger/Policy)",
		],
		recommendations: [
			{
				level: "must",
				text: "Kettenintegrität täglich automatisch prüfen; ein Bruch ist ein Sicherheitsvorfall.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie beweisen Sie, dass ein Audit-Eintrag nachträglich nicht verändert wurde?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-LOG-02",
		title: "Sicherheitsüberwachung und Anomalieerkennung",
		description:
			"Protokolle werden zentral ausgewertet; Anomalien (Fehlanmeldungen, ungewöhnliche Exporte, neue Standorte, Kettenbrüche) lösen Alarme aus, die bearbeitet und dokumentiert werden.",
		domain: "operations",
		effort: "L",
		kind: "technical",
		evidenceHints: ["Alarmregeln", "SOC-/MDR-Berichte", "Alarmbearbeitung"],
		recommendations: [
			{
				level: "should",
				text: "Mit wenigen präzisen Alarmen starten (≥ 5 MFA-Fehler, Login aus neuem Land, Export > 1 000 Zeilen, Kettenbruch) und bei Skalierung an einen MDR-Dienst übergeben.",
				source: "intern",
			},
		],
		auditQuestions: ["Welche Alarme gibt es und wer reagiert darauf wann?"],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-LOG-03",
		title: "Protokollierungskonzept und Log-Aufbewahrung",
		description:
			"Ein Konzept legt fest, welche Ereignisse protokolliert werden, wie lange Protokolle aufbewahrt werden, wie sie vor Zugriff und Veränderung geschützt sind und welche Daten (Secrets, PII) nie protokolliert werden.",
		domain: "operations",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Logging-Konzept",
			"Redaction-Regeln",
			"Aufbewahrungsfristen",
		],
		auditQuestions: [
			"Welche Daten dürfen nie im Log landen und wie wird das erzwungen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Netz ─────────────────────────────────────────────────────────────────
	{
		code: "CC-NET-01",
		title: "Netzsicherheitskonzept und Segmentierung",
		description:
			"Netze sind nach Schutzbedarf segmentiert (Produktion, Verwaltung, Entwicklung); Verbindungen zwischen Segmenten sind auf das Notwendige beschränkt und dokumentiert.",
		domain: "network",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Netzsicherheitskonzept",
			"Segmentierungsplan",
			"Firewall-Regelwerk",
		],
		auditQuestions: ["Wie ist die Datenbank vom Internet getrennt?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-NET-02",
		title: "Perimeterschutz, Firewall und Rate-Limits",
		description:
			"Nur benötigte Ports sind erreichbar; Firewall-Regeln werden regelmässig überprüft; Rate-Limits und Brute-Force-Schutz sichern Authentisierungs- und API-Endpunkte.",
		domain: "network",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Firewall-Regelwerk",
			"Rate-Limit-Konfiguration",
			"Review-Protokolle",
		],
		auditQuestions: ["Welche Ports sind von aussen erreichbar und warum?"],
		testMethodHint: "vuln_scan",
		sortOrder: next(),
	},
	{
		code: "CC-NET-03",
		title: "Sicherheit von Netzdiensten und Webfilterung",
		description:
			"Sicherheitsanforderungen an genutzte Netzdienste (CDN, DNS, E-Mail) sind vertraglich und technisch festgelegt; der Zugriff auf schädliche Webinhalte wird gefiltert.",
		domain: "network",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"SLA-Nachweise",
			"Filterregeln",
			"DNS-/Mail-Sicherheit (SPF, DKIM, DMARC)",
		],
		auditQuestions: [
			"Welche Sicherheitszusagen haben Ihre Netzdienstleister gemacht?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Entwicklung ──────────────────────────────────────────────────────────
	{
		code: "CC-DEV-01",
		title: "Sicherer Entwicklungslebenszyklus",
		description:
			"Sicherheit ist in jeder Phase der Entwicklung verankert: Anforderungen, Design-Review, sichere Programmierung, automatisierte Prüfungen in der Pipeline, Freigabe und Betrieb.",
		domain: "development",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"SDLC-Richtlinie",
			"Pipeline-Konfiguration",
			"Review-Nachweise",
		],
		recommendations: [
			{
				level: "must",
				text: "Kein Deploy ohne grüne Pipeline (Typecheck, Lint, Tests, Abhängigkeitsprüfung, Secret-Scan).",
				source: "intern",
			},
		],
		auditQuestions: [
			"Welche Prüfungen muss jede Änderung vor Produktion bestehen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-02",
		title: "Sicherheitsanforderungen und Bedrohungsmodellierung",
		description:
			"Sicherheitsanforderungen (z. B. OWASP ASVS) sind festgelegt; Architektur und wesentliche Änderungen werden einer Bedrohungsmodellierung unterzogen.",
		domain: "development",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Anforderungskatalog",
			"Threat Model",
			"Architekturprinzipien",
		],
		auditQuestions: [
			"Gibt es ein aktuelles Bedrohungsmodell für die Plattform?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-03",
		title: "Sichere Programmierung und statische Analyse",
		description:
			"Coding-Standards sind definiert; statische Analyse (SAST), Lint und Typprüfung laufen automatisiert; Befunde werden vor dem Merge behoben.",
		domain: "development",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Coding-Standards", "SAST-Berichte", "CodeQL-Ergebnisse"],
		auditQuestions: [
			"Welche SAST-Werkzeuge laufen und wie werden Befunde priorisiert?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-04",
		title: "Sicherheitstests",
		description:
			"Anwendungen werden dynamisch getestet (DAST) und vor Go-Live sowie nach wesentlichen Änderungen durch unabhängige Penetrationstests geprüft; Befunde werden nachverfolgt.",
		domain: "development",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"DAST-Berichte",
			"Pentest-Berichte",
			"Massnahmenverfolgung",
		],
		recommendations: [
			{
				level: "must",
				text: "Externer Pentest vor Go-Live und danach jährlich; Tester mit Zertifizierung und Haftpflicht.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wann war der letzte Pentest und sind alle kritischen Befunde geschlossen?",
		],
		testMethodHint: "pentest",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-05",
		title: "Lieferkettensicherheit für Softwareabhängigkeiten",
		description:
			"Abhängigkeiten werden aus vertrauenswürdigen Quellen mit Versionssperre bezogen, auf bekannte Schwachstellen geprüft, mit Karenzzeit gegen kompromittierte Releases installiert und in einer SBOM dokumentiert.",
		domain: "development",
		effort: "S",
		kind: "technical",
		evidenceHints: [
			"SBOM",
			"Lockfile",
			"Cooldown-Konfiguration",
			"Scan-Berichte (OSV, Audit)",
		],
		recommendations: [
			{
				level: "should",
				text: "Lifecycle-Skripte blockieren und neue Releases erst nach 7 Tagen zulassen — die wirksamste Massnahme gegen Supply-Chain-Angriffe auf npm.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wie schnell erfahren Sie von einer kompromittierten Abhängigkeit?",
		],
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-06",
		title: "Änderungsmanagement",
		description:
			"Änderungen an Systemen und Anwendungen werden beantragt, bewertet, getestet, freigegeben und dokumentiert; Notfall-Changes sind geregelt und werden nachträglich geprüft.",
		domain: "development",
		effort: "M",
		kind: "process",
		evidenceHints: ["Change-Prozess", "Change-Protokolle", "Freigaben"],
		auditQuestions: [
			"Wie wird eine Notfalländerung nachträglich kontrolliert?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-07",
		title: "Trennung von Entwicklungs-, Test- und Produktionsumgebungen",
		description:
			"Umgebungen sind logisch und zugriffsseitig getrennt; Produktionsdaten und -zugänge sind in Entwicklung und Test nicht verfügbar.",
		domain: "development",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Umgebungskonzept", "Getrennte Konten/Datenbanken"],
		auditQuestions: [
			"Kann aus der Entwicklungsumgebung auf Produktionsdaten zugegriffen werden?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-DEV-08",
		title: "Ausgelagerte Entwicklung",
		description:
			"Extern entwickelte Software unterliegt denselben Sicherheitsanforderungen; Verträge regeln Code-Eigentum, Sicherheitstests, Schwachstellenbehandlung und Review-Rechte.",
		domain: "development",
		effort: "S",
		kind: "organizational",
		evidenceHints: ["Vertragsklauseln", "Abnahmetests"],
		auditQuestions: [
			"Welche Sicherheitsvorgaben gelten für externe Entwickler:innen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Resilienz-Tests ──────────────────────────────────────────────────────
	{
		code: "CC-TST-01",
		title: "Risikobasiertes Resilienz-Testprogramm",
		description:
			"Ein jährliches Testprogramm prüft kritische Systeme und Prozesse mit passenden Testarten (Schwachstellenscans, Quellcode-Reviews, Szenario-, Last- und Penetrationstests); Tester sind unabhängig, Befunde werden behoben.",
		domain: "development",
		effort: "M",
		kind: "process",
		evidenceHints: ["Testprogramm", "Jahresplan", "Testberichte je Testart"],
		recommendations: [
			{
				level: "must",
				text: "Kritische Systeme mindestens jährlich testen; Testart je System begründen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Tests sind für dieses Jahr geplant und was wurde bereits durchgeführt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TST-02",
		title: "Bedrohungsorientierte Penetrationstests (TLPT)",
		description:
			"Sofern von der Aufsicht benannt, werden alle drei Jahre bedrohungsorientierte Penetrationstests nach TIBER-DE durch qualifizierte Tester durchgeführt und attestiert; ohne Benennung ist der Negativnachweis dokumentiert.",
		domain: "development",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"Benennungsbescheid oder Negativnachweis",
			"TLPT-Bericht",
			"Attestierung",
		],
		auditQuestions: [
			"Wurde Ihr Institut für TLPT benannt? Wo ist das dokumentiert?",
		],
		testMethodHint: "tlpt",
		sortOrder: next(),
	},

	// ── Dienstleister ────────────────────────────────────────────────────────
	{
		code: "CC-TPR-01",
		title: "Dienstleister-Register und Informationsregister",
		description:
			"Alle IKT-Dienstleister, Auslagerungen und Geschäftspartner sind mit Vertrag, Leistung, Kritikalität, Datenstandort und Unterauftragnehmern erfasst; das Register ist im aufsichtlichen Format exportierbar.",
		domain: "supplier",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Dienstleister-Register",
			"Informationsregister (ITS 2024/2956)",
			"Einreichungsbeleg",
		],
		recommendations: [
			{
				level: "must",
				text: "Register laufend pflegen, nicht erst im März — die jährliche Einreichung ist dann ein Export.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Ist jeder Dienstleister mit Vertrag und Kritikalität erfasst?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-02",
		title: "Drittparteien-Strategie und -Richtlinie",
		description:
			"Eine Strategie und Richtlinie regeln Auswahl, Bewertung, Vertragsgestaltung, Überwachung und Beendigung von Dienstleisterbeziehungen; die Leitung überprüft sie jährlich.",
		domain: "supplier",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Drittparteien-Strategie",
			"Richtlinie",
			"Jährlicher Beschluss",
		],
		auditQuestions: [
			"Wann hat die Leitung die Drittparteien-Richtlinie zuletzt geprüft?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-03",
		title: "Due Diligence vor Vertragsschluss",
		description:
			"Vor Vertragsschluss werden Eignung, Sicherheitsniveau, Zertifikate, finanzielle Stabilität, Standorte und Interessenkonflikte des Dienstleisters geprüft und dokumentiert.",
		domain: "supplier",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Due-Diligence-Berichte",
			"Zertifikate (SOC 2, ISAE 3402, C5)",
		],
		auditQuestions: [
			"Welche Prüfung ging dem Vertrag mit Ihrem Hosting-Anbieter voraus?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-04",
		title: "Vertragliche Pflichtklauseln",
		description:
			"Verträge enthalten die aufsichtlich geforderten Inhalte: Leistungsbeschreibung, Standorte, Datenschutz, Prüf- und Zugangsrechte, Vorfallunterstützung, Kündigung, Unterauftrag; bei kritischen Funktionen zusätzlich SLAs, Exit und Mitwirkung bei Tests.",
		domain: "supplier",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Klausel-Checkliste je Vertrag", "Vertrags-Addenda"],
		recommendations: [
			{
				level: "must",
				text: "Checkliste nach DORA Art. 30 je Vertrag abhaken; fehlende Klauseln als Lücke mit Nachverhandlungstermin führen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Verträge erfüllen die Pflichtklauseln noch nicht?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-05",
		title: "Laufende Überwachung von Dienstleistern",
		description:
			"Leistung, Sicherheit und Prüfberichte der Dienstleister werden regelmässig bewertet; Mängel werden eskaliert und nachverfolgt.",
		domain: "supplier",
		effort: "M",
		kind: "process",
		evidenceHints: ["Jährliche Bewertungen", "Prüfberichte", "Eskalationen"],
		auditQuestions: [
			"Wann wurde Ihr kritischster Dienstleister zuletzt bewertet?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-06",
		title: "Exit-Strategien und Ausstiegspläne",
		description:
			"Für Dienstleister kritischer Funktionen existieren getestete Ausstiegspläne mit Alternativen, Datenrückführung und Zeitplan; Kündigungsrechte sind vertraglich gesichert.",
		domain: "supplier",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Exit-Pläne", "Testnachweise", "Kündigungsrechte"],
		auditQuestions: [
			"Wie lange bräuchten Sie, um den Hosting-Anbieter zu wechseln?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-07",
		title: "Konzentrationsrisiko und Unterauftragsvergabe",
		description:
			"Abhängigkeiten von einzelnen Dienstleistern, Ländern und Unterauftragnehmern werden analysiert; Unterauftragsvergabe bei kritischen Funktionen ist vertraglich geregelt und im Register abgebildet.",
		domain: "supplier",
		effort: "S",
		kind: "process",
		evidenceHints: ["Konzentrationsanalyse", "Subunternehmerkette im Register"],
		auditQuestions: [
			"Welcher Anteil kritischer Funktionen hängt von einem Anbieter ab?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-08",
		title: "Cloud-Dienste-Richtlinie",
		description:
			"Nutzung von Cloud-Diensten ist geregelt: Datenresidenz (EU), Verschlüsselung, geteilte Verantwortung, Testate, Exit; freigegebene Dienste sind gelistet.",
		domain: "supplier",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Cloud-Richtlinie",
			"Liste freigegebener Dienste",
			"C5-/SOC-2-Testate",
		],
		auditQuestions: [
			"Wo liegen die Daten physisch und wer kann darauf zugreifen?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-09",
		title: "Anzeigen an die Aufsicht und CTPP-Abgleich",
		description:
			"Geplante Verträge über kritische oder wichtige Funktionen werden der Aufsicht vorab angezeigt; Dienstleister werden mit der ESA-Liste kritischer IKT-Drittdienstleister abgeglichen.",
		domain: "supplier",
		effort: "S",
		kind: "process",
		evidenceHints: ["Anzeigen (MVP-Belege)", "CTPP-Abgleich"],
		auditQuestions: ["Welche Verträge wurden der BaFin vorab angezeigt?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Vorfälle ─────────────────────────────────────────────────────────────
	{
		code: "CC-INC-01",
		title: "Vorfallmanagementprozess und Vorfallregister",
		description:
			"Ein dokumentierter Prozess erfasst alle Sicherheits- und Betriebsvorfälle mit Rollen, Eskalation, Frühwarnindikatoren, Kommunikation und Berichterstattung an die Leitung; jeder Vorfall steht im Register.",
		domain: "incident",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Incident-Response-Plan",
			"Vorfallregister",
			"Eskalationsmatrix",
		],
		recommendations: [
			{
				level: "must",
				text: "Vorfall in drei Feldern meldbar machen (was, wann bemerkt, betrifft Zahlungen/Kunden?) — die Uhren laufen ab Kenntnis.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Zeigen Sie die letzten drei Vorfälle vom Eingang bis zum Abschluss.",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-INC-02",
		title: "Klassifizierung und Bewertung von Ereignissen",
		description:
			"Ereignisse werden nach festen Kriterien (Kunden, Dauer, Reputation, Geografie, Datenverlust, Kritikalität, wirtschaftliche Auswirkung) bewertet und als Vorfall eingestuft oder verworfen.",
		domain: "incident",
		effort: "S",
		kind: "process",
		evidenceHints: ["Klassifizierungsmatrix", "Bewertungsprotokolle"],
		recommendations: [
			{
				level: "must",
				text: "Kriterien der RTS 2024/1772 als Entscheidungsbaum hinterlegen, damit die Einstufung reproduzierbar ist.",
				source: "EBA GL",
			},
		],
		auditQuestions: ["Wie entscheiden Sie, ob ein Vorfall schwerwiegend ist?"],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-INC-03",
		title: "Meldeprozess an Behörden mit Fristen",
		description:
			"Meldepflichtige Vorfälle werden fristgerecht an die zuständigen Behörden gemeldet (DORA: Erstmeldung, Zwischenbericht, Abschlussbericht; NIS2: Frühwarnung, Meldung, Abschluss; DSGVO 72 h); Vorlagen und Meldewege sind vorbereitet.",
		domain: "incident",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Melde-Playbook",
			"Ausgefüllte Meldevorlagen",
			"Portal-Zugang (BaFin-MVP)",
			"Feedback-Log",
		],
		recommendations: [
			{
				level: "must",
				text: "Fristenuhren im Werkzeug ab Kenntniszeitpunkt automatisch laufen lassen; Zugang zum Meldeportal vor dem ersten Vorfall testen.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Welche Fristen gelten für welches Regime und wer meldet?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-INC-04",
		title: "Reaktions-Playbooks und Krisenkommunikation",
		description:
			"Für typische Vorfallarten existieren Playbooks; ein Krisenkommunikationsplan regelt Information von Kunden, Partnern, Aufsicht und Öffentlichkeit mit benannter Sprecherfunktion.",
		domain: "incident",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Playbooks", "Krisenkommunikationsplan", "Vorlagen"],
		auditQuestions: ["Wer spricht bei einem Vorfall mit Kunden und Presse?"],
		testMethodHint: "bcm_exercise",
		sortOrder: next(),
	},
	{
		code: "CC-INC-05",
		title: "Lernen aus Vorfällen",
		description:
			"Nach jedem wesentlichen Vorfall findet eine Nachbetrachtung mit Ursachenanalyse statt; Erkenntnisse fliessen in Massnahmen, Risiken, Schulungen und Richtlinien.",
		domain: "incident",
		effort: "S",
		kind: "process",
		evidenceHints: [
			"Post-Mortems",
			"Lessons-Learned-Berichte",
			"Abgeleitete Massnahmen",
		],
		auditQuestions: [
			"Was haben Sie aus dem letzten schwerwiegenden Vorfall geändert?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-INC-06",
		title: "Forensik und Beweissicherung",
		description:
			"Beweise werden so gesammelt und aufbewahrt, dass sie gerichtsfest bleiben (Chain of Custody); forensische Unterstützung ist vorbereitet (Retainer oder interner Leitfaden).",
		domain: "incident",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Forensik-Leitfaden",
			"Retainer-Vertrag",
			"Chain-of-Custody-Formulare",
		],
		auditQuestions: ["Wie sichern Sie Beweise, ohne sie zu verändern?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-INC-07",
		title: "Meldekanal für Mitarbeitende",
		description:
			"Mitarbeitende können Sicherheitsereignisse und Schwächen einfach und ohne Nachteile melden; Meldungen werden bestätigt und bearbeitet.",
		domain: "incident",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"Meldekanal",
			"Eingangsbestätigungen",
			"Bearbeitungsnachweise",
		],
		auditQuestions: ["Wie meldet eine Mitarbeiterin eine verdächtige E-Mail?"],
		testMethodHint: "interview",
		sortOrder: next(),
	},

	// ── Kontinuität ──────────────────────────────────────────────────────────
	{
		code: "CC-BCM-01",
		title: "Geschäftsfortführungsleitlinie und Notfallpläne",
		description:
			"Eine Leitlinie und Pläne für Reaktion und Wiederherstellung sichern kritische Funktionen bei Störungen; Verantwortliche, Auslöser und Wiederanlaufreihenfolge sind festgelegt.",
		domain: "continuity",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"BCM-Leitlinie",
			"Notfall-/Wiederanlaufpläne",
			"Freigabe der Leitung",
		],
		auditQuestions: ["Welcher Plan greift bei Ausfall des Hosting-Anbieters?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-BCM-02",
		title: "Business-Impact-Analyse",
		description:
			"Für jeden Prozess sind Kritikalität, maximal tolerierbare Ausfallzeit, Wiederanlaufzeit (RTO) und Datenverlusttoleranz (RPO) bewertet; kritische Funktionen und Abhängigkeiten sind daraus abgeleitet.",
		domain: "continuity",
		effort: "M",
		kind: "process",
		evidenceHints: ["BIA", "RTO/RPO je Prozess", "Liste kritischer Funktionen"],
		auditQuestions: [
			"Welche RTO gilt für die Zahlungsabwicklung und wie wurde sie hergeleitet?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-BCM-03",
		title: "Datensicherung und Wiederherstellungstests",
		description:
			"Backups laufen automatisch, sind verschlüsselt, an einem getrennten Standort aufbewahrt und gegen Veränderung geschützt; Wiederherstellung wird regelmässig getestet und protokolliert.",
		domain: "continuity",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Backup-Konzept",
			"Restore-Protokolle",
			"Offsite-/Immutable-Nachweis",
		],
		recommendations: [
			{
				level: "must",
				text: "Restore-Test quartalsweise in eine frische Umgebung inkl. Prüfung der Audit-Kette; Ergebnis als Nachweis ablegen.",
				source: "BSI IT-Grundschutz",
				ref: "CON.3",
			},
		],
		auditQuestions: [
			"Wann wurde zuletzt ein Restore getestet und wie lange hat es gedauert?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-BCM-04",
		title: "Redundanz und Hochverfügbarkeit",
		description:
			"Kritische Komponenten sind redundant ausgelegt (Standorte, Instanzen, Datenbank-Replikation), sodass Einzelausfälle die Verfügbarkeitsziele nicht gefährden.",
		domain: "continuity",
		effort: "L",
		kind: "technical",
		evidenceHints: [
			"Hochverfügbarkeitskonzept",
			"Architekturdiagramm",
			"Failover-Tests",
		],
		auditQuestions: ["Welche Komponente ist ein Single Point of Failure?"],
		testMethodHint: "bcm_exercise",
		sortOrder: next(),
	},
	{
		code: "CC-BCM-05",
		title: "Notfallübungen",
		description:
			"Notfall- und Wiederanlaufpläne werden mindestens jährlich geübt (Tabletop bis technischer Failover), auch mit Szenarien zum Ausfall kritischer Dienstleister; Ergebnisse fliessen in die Pläne zurück.",
		domain: "continuity",
		effort: "M",
		kind: "process",
		evidenceHints: ["Übungsplan", "Übungsprotokolle", "Massnahmen aus Übungen"],
		auditQuestions: [
			"Wann wurde der Notfallplan zuletzt geübt und was wurde angepasst?",
		],
		testMethodHint: "bcm_exercise",
		sortOrder: next(),
	},
	{
		code: "CC-BCM-06",
		title: "Krisenmanagement und Krisenstab",
		description:
			"Ein Krisenstab mit klaren Rollen, Einberufungsregeln und Kontaktliste steuert schwerwiegende Störungen; Krisenkontakte sind auch offline verfügbar.",
		domain: "continuity",
		effort: "S",
		kind: "organizational",
		evidenceHints: [
			"Krisenstab-Ordnung",
			"Kontaktliste",
			"Einberufungsprotokolle",
		],
		auditQuestions: [
			"Wer ruft den Krisenstab ein und wie erreichen Sie ihn ohne Firmen-IT?",
		],
		testMethodHint: "bcm_exercise",
		sortOrder: next(),
	},

	// ── Compliance ───────────────────────────────────────────────────────────
	{
		code: "CC-CMP-01",
		title: "Datenschutz-Management",
		description:
			"Verarbeitungsverzeichnis, Rechtsgrundlagen, Auftragsverarbeitungsverträge, Datenschutz-Folgenabschätzungen, Betroffenenrechte und Meldewege bei Datenschutzverletzungen sind geregelt und belegt.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Verarbeitungsverzeichnis",
			"AV-Verträge",
			"DSFA",
			"Löschkonzept",
		],
		auditQuestions: ["Für welche Verarbeitungen liegt eine DSFA vor?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CMP-02",
		title: "Zertifizierungen und Testate",
		description:
			"Externe Zertifizierungen (ISO 27001) und Testate (SOC 2, C5) werden angestrebt oder aufrechterhalten; zertifizierte Produkte und Dienste werden bevorzugt eingesetzt.",
		domain: "compliance",
		effort: "M",
		kind: "organizational",
		evidenceHints: ["Zertifikate", "Auditberichte", "Überwachungsaudits"],
		auditQuestions: [
			"Welche Zertifizierungen bestehen und wann sind die nächsten Audits?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Personal ─────────────────────────────────────────────────────────────
	{
		code: "CC-HR-01",
		title: "Sicherheitsüberprüfung vor Einstellung",
		description:
			"Vor Einstellung oder Beauftragung werden Identität, Referenzen und — bei Schlüsselpositionen — Führungszeugnis und Bonität risikoangemessen geprüft.",
		domain: "hr",
		effort: "S",
		kind: "process",
		evidenceHints: ["Screening-Prozess", "Nachweise je Schlüsselperson"],
		auditQuestions: [
			"Welche Prüfungen durchläuft eine Person mit Zugriff auf Kundengelder?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-HR-02",
		title: "Beschäftigungsbedingungen, Vertraulichkeit und Austritt",
		description:
			"Arbeits- und Dienstverträge enthalten Sicherheits- und Vertraulichkeitspflichten; Pflichten nach Austritt sind geregelt und werden kommuniziert.",
		domain: "hr",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Vertragsklauseln", "NDAs", "Austrittsprozess"],
		auditQuestions: ["Welche Pflichten gelten für Ausgeschiedene weiter?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-HR-03",
		title: "Schulungs- und Awareness-Programm",
		description:
			"Alle Mitarbeitenden werden bei Eintritt und regelmässig zu Informationssicherheit geschult; rollenbezogene Pflichtschulungen und Teilnahme sind in einer Kompetenzmatrix nachgewiesen.",
		domain: "hr",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Schulungsplan",
			"Teilnahmenachweise",
			"Kompetenzmatrix",
			"Phishing-Simulation",
		],
		recommendations: [
			{
				level: "must",
				text: "Pflichtschulung je Funktion definieren (z. B. GwG jährlich, DORA-Leitung jährlich) und Fälligkeiten automatisch als Aufgaben erzeugen.",
				source: "intern",
			},
		],
		auditQuestions: ["Wer hat die Pflichtschulung noch nicht absolviert?"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-HR-04",
		title: "Disziplinarverfahren",
		description:
			"Ein formales Verfahren regelt den Umgang mit Verstössen gegen Sicherheitsvorgaben, verhältnismässig und dokumentiert.",
		domain: "hr",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Regelung Disziplinarverfahren"],
		auditQuestions: [
			"Was passiert bei einem wiederholten Verstoss gegen die Richtlinien?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
];

export const CONTROLS: CatalogControl[] = [...PART_A, ...PART_B];

export const CONTROL_BY_CODE: ReadonlyMap<string, CatalogControl> = new Map(
	CONTROLS.map((c) => [c.code, c]),
);
