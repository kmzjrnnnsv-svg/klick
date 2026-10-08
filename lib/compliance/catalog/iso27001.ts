import type { CatalogRequirement, CatalogSection, Tools } from "./types";

// ISO/IEC 27001:2022 — Klauseln 4–10 und Annex A (93 Controls).
// Authoring-Quelle: docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 1.
// Normtext ist urheberrechtlich geschützt: `requirementText` ist eine Paraphrase,
// keine Übernahme. "(P)" in evidenceHints = Pflichtdokument der Norm.

type Draft = Omit<CatalogRequirement, "sortOrder">;

const tools = (startup: string[], scale: string[] = []): Tools => ({
	startup,
	scale,
});

const GRC_TOOLS = tools(
	["GRC-Tool: Secjur", "Vanta", "Drata", "verinice"],
	["HiScout GRC", "ServiceNow IRM"],
);
const TPRM_TOOLS = tools(
	["TPRM: Vanta/Drata-Modul"],
	["OneTrust TPRM", "Mitratech Prevalent", "Panorays"],
);

export const ISO27001_SECTIONS: CatalogSection[] = [
	{ code: "4", title: "Kontext der Organisation", sortOrder: 10 },
	{ code: "5", title: "Führung", sortOrder: 20 },
	{ code: "6", title: "Planung", sortOrder: 30 },
	{ code: "7", title: "Unterstützung", sortOrder: 40 },
	{ code: "8", title: "Betrieb", sortOrder: 50 },
	{ code: "9", title: "Bewertung der Leistung", sortOrder: 60 },
	{ code: "10", title: "Verbesserung", sortOrder: 70 },
	{ code: "A.5", title: "Organisatorische Maßnahmen", sortOrder: 80 },
	{ code: "A.6", title: "Personenbezogene Maßnahmen", sortOrder: 90 },
	{ code: "A.7", title: "Physische Maßnahmen", sortOrder: 100 },
	{ code: "A.8", title: "Technologische Maßnahmen", sortOrder: 110 },
];

const CLAUSES: Draft[] = [
	{
		code: "4.1",
		sectionCode: "4",
		title: "Kontext der Organisation verstehen",
		requirementText:
			"Die Organisation bestimmt die internen und externen Themen, die für ihren Zweck relevant sind und ihre Fähigkeit beeinflussen, die beabsichtigten Ergebnisse des ISMS zu erreichen.",
		guidance:
			"Für ein Zahlungs-/Krypto-Institut gehören Aufsichtsregime (BaFin, DORA, MiCAR), Marktumfeld, Technologieabhängigkeiten und die eigene Lizenzstrategie in die Kontextanalyse; einmal jährlich im Management-Review aktualisieren.",
		domain: "governance",
		evidenceHints: ["Kontextanalyse (SWOT/PESTEL)"],
		auditQuestions: [
			"Welche internen und externen Themen beeinflussen dein ISMS, und wo sind sie dokumentiert?",
			"Wann wurde die Kontextanalyse zuletzt überprüft?",
		],
		pitfalls: [
			"Kontextanalyse wird einmal für das Zertifizierungsaudit erstellt und danach nie wieder angefasst.",
		],
		recommendations: [
			{
				level: "should",
				text: "Kontextanalyse mit Risikoregister und Rechtskataster verknüpfen, damit Änderungen (z. B. neue Lizenzstufe) Folgearbeiten auslösen.",
				source: "intern",
			},
		],
		tools: GRC_TOOLS,
	},
	{
		code: "4.2",
		sectionCode: "4",
		title: "Erfordernisse interessierter Parteien",
		requirementText:
			"Die Organisation ermittelt die für das ISMS relevanten interessierten Parteien und deren Anforderungen und legt fest, welche davon über das ISMS erfüllt werden.",
		guidance:
			"Typische Parteien: BaFin, Bundesbank, BSI, Kunden, Zahlungsnetzwerke, Cloud-Anbieter, Wirtschaftsprüfer; rechtliche und vertragliche Anforderungen landen im Rechtskataster (A.5.31).",
		domain: "governance",
		evidenceHints: ["Stakeholder- und Rechtsregister"],
		auditQuestions: [
			"Welche interessierten Parteien hast du identifiziert, und welche Anforderungen stellen sie an die Informationssicherheit?",
		],
		pitfalls: [
			"Aufsichtsbehörden werden als Partei genannt, ihre konkreten Anforderungen (Meldepflichten, Auslagerungsanzeigen) aber nicht abgeleitet.",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jede Partei die konkreten Anforderungen und ihre Quelle (Gesetz, Vertrag, Erwartung) festhalten und mit dem Rechtskataster (A.5.31) verknüpfen.",
				source: "intern",
			},
		],
		tools: GRC_TOOLS,
	},
	{
		code: "4.3",
		sectionCode: "4",
		title: "Anwendungsbereich des ISMS",
		requirementText:
			"Die Organisation legt Grenzen und Anwendbarkeit des ISMS fest und berücksichtigt dabei Kontext, Anforderungen der Parteien sowie Schnittstellen und Abhängigkeiten zu Tätigkeiten anderer Organisationen. Der Anwendungsbereich liegt als dokumentierte Information vor.",
		guidance:
			"Scope so schneiden, dass alle zahlungs- und kryptorelevanten Prozesse, Standorte und Cloud-Umgebungen enthalten sind; ausgelagerte Dienste als Schnittstelle benennen, nicht ausklammern.",
		domain: "governance",
		evidenceHints: ["(P) Scope-Dokument"],
		auditQuestions: [
			"Was ist im Anwendungsbereich enthalten, was ausgeschlossen, und warum?",
			"Wie werden Schnittstellen zu Dienstleistern im Scope behandelt?",
		],
		pitfalls: [
			"Scope auf eine Abteilung begrenzt, obwohl Aufsicht und Kunden das gesamte Institut im Blick haben.",
		],
		recommendations: [
			{
				level: "must",
				text: "Scope deckungsgleich mit den aufsichtlich relevanten Geschäftsprozessen (ZAG/MiCAR) halten, damit das Zertifikat als DORA-Nachweis taugt.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.8(1-4)"],
		tools: GRC_TOOLS,
	},
	{
		code: "4.4",
		sectionCode: "4",
		title: "Informationssicherheitsmanagementsystem",
		requirementText:
			"Die Organisation errichtet, verwirklicht, erhält und verbessert fortlaufend ein ISMS einschließlich der benötigten Prozesse und ihrer Wechselwirkungen.",
		guidance:
			"Ein ISMS-Handbuch mit Prozesslandkarte (Risiko, Vorfall, Change, Lieferanten, Audit, Review) reicht als Klammer; die Prozesse selbst leben im GRC-Tool.",
		domain: "governance",
		evidenceHints: ["ISMS-Handbuch", "Prozesslandkarte"],
		auditQuestions: [
			"Welche Prozesse bilden dein ISMS, und wie hängen sie zusammen?",
		],
		recommendations: [
			{
				level: "should",
				text: "ISMS-Prozesse als PDCA-Zyklus mit Terminen im Kalender hinterlegen (Risikobeurteilung, Audit, Review, Schulung).",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(1-4)", "nis2:Art.21(1)"],
		tools: tools(["Confluence", "Claude Docs"], ["ServiceNow"]),
	},
	{
		code: "5.1",
		sectionCode: "5",
		title: "Führung und Verpflichtung",
		requirementText:
			"Die oberste Leitung zeigt Führung und Verpflichtung für das ISMS: Sie stellt sicher, dass Politik und Ziele zur Strategie passen, Ressourcen bereitstehen, die Bedeutung der Informationssicherheit vermittelt wird und das ISMS seine Ergebnisse erreicht.",
		guidance:
			"Bei Finanzinstituten verantwortet die Geschäftsleitung die IKT-Risikostrategie selbst (DORA Art. 5); Beschlüsse und Freigaben protokollieren.",
		domain: "governance",
		evidenceHints: ["Freigabeprotokolle", "Management-Bewertung"],
		auditQuestions: [
			"Wie zeigt die Geschäftsleitung ihre Verpflichtung zur Informationssicherheit?",
			"Welche ISMS-Themen wurden zuletzt in Leitungssitzungen behandelt?",
		],
		pitfalls: [
			"Verantwortung vollständig an den ISB delegiert; die Geschäftsleitung kennt die wesentlichen Risiken nicht.",
		],
		recommendations: [
			{
				level: "must",
				text: "Informationssicherheit als festen Tagesordnungspunkt in Geschäftsleitungssitzungen führen und Beschlüsse protokollieren.",
				source: "intern",
			},
			{
				level: "should",
				text: "Mindestens ein Mitglied der Geschäftsleitung als Sponsor des ISMS benennen.",
				source: "BSI IT-Grundschutz",
				ref: "ISMS.1",
			},
		],
		relatedRequirements: ["dora:Art.5(2)", "nis2:Art.20(1)"],
	},
	{
		code: "5.2",
		sectionCode: "5",
		title: "Informationssicherheitspolitik",
		requirementText:
			"Die oberste Leitung legt eine Informationssicherheitspolitik fest, die zum Zweck der Organisation passt, Ziele oder einen Rahmen für Ziele enthält und die Verpflichtung zur Erfüllung der Anforderungen und zur fortlaufenden Verbesserung ausdrückt. Sie ist dokumentiert, bekannt gemacht und bei Bedarf für interessierte Parteien verfügbar.",
		guidance:
			"Kurze, von der Geschäftsleitung unterschriebene Leitlinie (2–4 Seiten); Details in Themenrichtlinien nach A.5.1.",
		domain: "governance",
		evidenceHints: ["(P) Leitlinie, von GL unterschrieben"],
		auditQuestions: [
			"Wer hat die Leitlinie freigegeben, und wie wurde sie an Mitarbeitende kommuniziert?",
		],
		recommendations: [
			{
				level: "must",
				text: "Leitlinie jährlich im Management-Review bestätigen und bei Strategiewechsel (neue Lizenz, neue Dienste) anpassen.",
				source: "ISO 27002",
				ref: "5.1",
			},
		],
		relatedRequirements: [
			"dora:Art.9(4)(a)",
			"dora:Art.6(8)",
			"nis2:Art.21(2)(a)",
		],
		tools: tools(["Dokumentenlenkung im GRC-Tool"]),
	},
	{
		code: "5.3",
		sectionCode: "5",
		title: "Rollen, Verantwortlichkeiten und Befugnisse",
		requirementText:
			"Die oberste Leitung weist Verantwortlichkeiten und Befugnisse für ISMS-relevante Rollen zu und kommuniziert sie, insbesondere für die Konformität des ISMS mit der Norm und für die Berichterstattung über die ISMS-Leistung an die Leitung.",
		guidance:
			"ISB/CISO organisatorisch getrennt vom IT-Betrieb; bei kleinen Teams Interessenkonflikte dokumentieren und kompensieren (Vier-Augen, externes Review). DORA verlangt zusätzlich eine Kontrollfunktion für IKT-Risiko.",
		domain: "governance",
		evidenceHints: ["Rollenbeschreibungen ISB", "RACI"],
		auditQuestions: [
			"Wer ist für das ISMS verantwortlich, und wie berichtet diese Person an die Geschäftsleitung?",
		],
		pitfalls: ["ISB ist gleichzeitig IT-Leiter und prüft seine eigene Arbeit."],
		recommendations: [
			{
				level: "must",
				text: "Rollen ISB, IKT-Risikofunktion, Datenschutzbeauftragter und Geldwäschebeauftragter in einer RACI-Matrix abgrenzen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.5(2)", "dora:Art.6(1-4)"],
	},
	{
		code: "6.1.1",
		sectionCode: "6",
		title: "Maßnahmen zum Umgang mit Risiken und Chancen",
		requirementText:
			"Bei der Planung des ISMS bestimmt die Organisation die Risiken und Chancen, die behandelt werden müssen, damit das ISMS seine Ergebnisse erreicht, unerwünschte Auswirkungen verhindert und Verbesserung erreicht wird. Sie plant entsprechende Maßnahmen, deren Integration und die Bewertung ihrer Wirksamkeit.",
		guidance:
			"Neben Informationssicherheitsrisiken auch ISMS-Risiken (Ressourcenmangel, Know-how-Verlust) und Chancen (Zertifikat als Vertriebsargument) im Register führen.",
		domain: "risk",
		evidenceHints: ["Risiko- und Chancenregister"],
		auditQuestions: [
			"Welche Risiken und Chancen für das ISMS selbst hast du identifiziert, und wie behandelst du sie?",
		],
		recommendations: [
			{
				level: "should",
				text: "Chancen und ISMS-Risiken als eigene Kategorie im Risikoregister führen statt in separaten Dokumenten.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(1-4)", "nis2:Art.21(1)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "6.1.2",
		sectionCode: "6",
		title: "Informationssicherheitsrisikobeurteilung",
		requirementText:
			"Die Organisation definiert und wendet einen Prozess zur Risikobeurteilung an, der Risikokriterien (Akzeptanz- und Durchführungskriterien) festlegt, konsistente und vergleichbare Ergebnisse liefert, Risiken mit Eigentümern identifiziert, Eintrittswahrscheinlichkeit und Auswirkung analysiert und die Risiken gegen die Kriterien bewertet und priorisiert.",
		guidance:
			"Methode an ISO 27005 oder BSI-Standard 200-3 anlehnen; Kriterien und Akzeptanzschwelle müssen zur Risikotoleranz passen, die DORA Art. 6(8) verlangt.",
		domain: "risk",
		evidenceHints: ["(P) Risikobeurteilungsmethodik", "(P) Ergebnisse"],
		auditQuestions: [
			"Nach welcher Methode beurteilst du Risiken, und wo ist die Akzeptanzschwelle festgelegt?",
			"Wie stellst du sicher, dass zwei Bewerter zum gleichen Ergebnis kommen?",
		],
		pitfalls: [
			"Risikokriterien fehlen oder werden je Bewertung neu interpretiert; Ergebnisse sind nicht vergleichbar.",
		],
		recommendations: [
			{
				level: "must",
				text: "Eine dokumentierte Methodik mit Skalen, Risikomatrix und Akzeptanzschwelle festlegen und bei jeder Beurteilung unverändert anwenden.",
				source: "ISO 27002",
			},
			{
				level: "should",
				text: "Szenariobasierte Beurteilung je Geschäftsprozess (Zahlungsabwicklung, Verwahrung) statt rein asset-basiert.",
				source: "BSI IT-Grundschutz",
				ref: "BSI-Standard 200-3",
			},
		],
		relatedRequirements: [
			"dora:Art.6(8)",
			"dora:Art.8(1-4)",
			"nis2:Art.21(2)(a)",
		],
		tools: tools(["GRC-Tool", "Methode: ISO 27005, BSI 200-3"]),
	},
	{
		code: "6.1.3",
		sectionCode: "6",
		title: "Informationssicherheitsrisikobehandlung",
		requirementText:
			"Die Organisation definiert und wendet einen Prozess zur Risikobehandlung an: Behandlungsoptionen wählen, erforderliche Maßnahmen bestimmen und mit Anhang A abgleichen, eine Erklärung zur Anwendbarkeit mit Begründungen für Ein- und Ausschlüsse erstellen, einen Risikobehandlungsplan formulieren und die Genehmigung der Risikoeigentümer für Plan und Restrisiken einholen.",
		guidance:
			"SoA direkt aus den Controls im GRC-Tool ableiten, damit Status und Begründung nie auseinanderlaufen; Restrisiko-Akzeptanz namentlich durch den Risikoeigentümer.",
		domain: "risk",
		evidenceHints: [
			"(P) Erklärung zur Anwendbarkeit (SoA)",
			"(P) Risikobehandlungsplan",
		],
		auditQuestions: [
			"Wie leitet sich die Erklärung zur Anwendbarkeit aus der Risikobehandlung ab?",
			"Wer hat die Restrisiken akzeptiert?",
		],
		pitfalls: [
			"SoA wird als Checkliste ohne Bezug zu konkreten Risiken ausgefüllt.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jeden ausgeschlossenen Annex-A-Control mit Begründung dokumentieren; Ausschlüsse sind bei Finanzinstituten selten plausibel.",
				source: "ISO 27002",
			},
		],
		relatedRequirements: ["dora:Art.6(1-4)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "6.2",
		sectionCode: "6",
		title: "Informationssicherheitsziele und Planung",
		requirementText:
			"Die Organisation legt für relevante Funktionen und Ebenen messbare Informationssicherheitsziele fest, die zur Politik passen, überwacht, kommuniziert und aktualisiert werden. Für jedes Ziel ist geplant, was getan wird, mit welchen Ressourcen, wer verantwortlich ist, bis wann und wie das Ergebnis bewertet wird.",
		guidance:
			"Drei bis sieben KPIs reichen: Patch-Zeiten, MFA-Abdeckung, Schulungsquote, Restore-Testerfolg, Vorfallreaktionszeit; Ziele mit der DORA-Resilienzstrategie verzahnen.",
		domain: "governance",
		evidenceHints: ["(P) Zielkatalog mit KPIs"],
		auditQuestions: [
			"Welche messbaren Sicherheitsziele hast du, und wie steht es um die Zielerreichung?",
		],
		pitfalls: ["Ziele sind Absichtserklärungen ohne Messgröße und Termin."],
		recommendations: [
			{
				level: "must",
				text: "Jedes Ziel nach SMART formulieren und die Messung in 9.1 verankern.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(8)"],
		tools: tools(["GRC-Tool", "Power BI"]),
	},
	{
		code: "6.3",
		sectionCode: "6",
		title: "Planung von Änderungen",
		requirementText:
			"Stellt die Organisation die Notwendigkeit von Änderungen am ISMS fest, führt sie diese Änderungen geplant durch.",
		guidance:
			"Ein kurzes Änderungsprotokoll (Anlass, Auswirkung, Freigabe, Umsetzung) genügt; technische Changes laufen über A.8.32.",
		domain: "governance",
		evidenceHints: ["Change-Protokoll ISMS"],
		auditQuestions: [
			"Wie planst und dokumentierst du Änderungen am ISMS, z. B. bei neuem Scope oder neuer Lizenzstufe?",
		],
		recommendations: [
			{
				level: "should",
				text: "ISMS-Änderungen als eigene Kategorie im Ticketsystem führen und im Management-Review auswerten.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(e)"],
		tools: tools(["Jira"]),
	},
	{
		code: "7.1",
		sectionCode: "7",
		title: "Ressourcen",
		requirementText:
			"Die Organisation bestimmt und stellt die Ressourcen bereit, die für Aufbau, Verwirklichung, Aufrechterhaltung und fortlaufende Verbesserung des ISMS erforderlich sind.",
		guidance:
			"Budget für Tools, externe Audits, Pentests und Schulungen sowie Zeitanteile des ISB jährlich planen und von der Geschäftsleitung freigeben lassen.",
		domain: "governance",
		evidenceHints: ["Budget- und Personalplan"],
		auditQuestions: [
			"Welches Budget und welche Personalkapazität stehen dem ISMS zur Verfügung, und wer hat sie genehmigt?",
		],
		recommendations: [
			{
				level: "should",
				text: "Ressourcenbedarf aus dem Risikobehandlungsplan ableiten und Lücken im Management-Review eskalieren.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.5(2)"],
	},
	{
		code: "7.2",
		sectionCode: "7",
		title: "Kompetenz",
		requirementText:
			"Die Organisation bestimmt die erforderliche Kompetenz der Personen, deren Tätigkeit die Informationssicherheitsleistung beeinflusst, stellt sie durch Ausbildung, Schulung oder Erfahrung sicher, ergreift bei Bedarf Maßnahmen zum Kompetenzerwerb und bewahrt Nachweise auf.",
		guidance:
			"Kompetenzmatrix je Rolle (ISB, Admins, Entwickler, Geschäftsleitung); DORA und NIS2 verlangen ausdrücklich ausreichende IKT-Kenntnisse der Leitung.",
		domain: "hr",
		evidenceHints: ["(P) Qualifikationsnachweise"],
		auditQuestions: [
			"Wie stellst du die Kompetenz von ISB, Administratoren und Geschäftsleitung sicher, und welche Nachweise liegen vor?",
		],
		pitfalls: [
			"Zertifikate sind vorhanden, aber nicht mit den Kompetenzanforderungen der Rolle verknüpft.",
		],
		recommendations: [
			{
				level: "must",
				text: "Kompetenzanforderungen je Rolle festlegen und Nachweise im HR-System ablegen; Geschäftsleitung jährlich zu IKT-Risiken schulen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.5(4)", "nis2:Art.20(2)"],
		tools: tools(["HR-System: Personio"]),
	},
	{
		code: "7.3",
		sectionCode: "7",
		title: "Bewusstsein",
		requirementText:
			"Personen, die unter der Aufsicht der Organisation tätig sind, kennen die Informationssicherheitspolitik, ihren Beitrag zur Wirksamkeit des ISMS, den Nutzen verbesserter Sicherheitsleistung und die Folgen von Nichtkonformität.",
		guidance:
			"Onboarding-Schulung plus jährliche Auffrischung und Phishing-Simulationen; Teilnahme nachweisen. Abgrenzung: 7.3 ist das Bewusstsein, A.6.3 die Schulungsmaßnahme.",
		domain: "hr",
		evidenceHints: ["Awareness-Nachweise"],
		auditQuestions: [
			"Wie stellst du sicher, dass alle Mitarbeitenden die Leitlinie und ihre Pflichten kennen?",
		],
		recommendations: [
			{
				level: "must",
				text: "Awareness-Programm mit jährlichem Pflichtmodul und Nachweis für die gesamte Belegschaft inklusive Geschäftsleitung und externen Mitarbeitenden.",
				source: "ISO 27002",
				ref: "6.3",
			},
		],
		relatedRequirements: ["dora:Art.13(6)", "nis2:Art.21(2)(g)"],
		tools: tools(["SoSafe", "KnowBe4", "Hornetsecurity"]),
	},
	{
		code: "7.4",
		sectionCode: "7",
		title: "Kommunikation",
		requirementText:
			"Die Organisation bestimmt die interne und externe Kommunikation, die für das ISMS relevant ist: worüber, wann, mit wem und wie kommuniziert wird.",
		guidance:
			"Kommunikationsmatrix inklusive Aufsichtsmeldungen (BaFin, BSI), Kundeninformation bei Vorfällen und interner Eskalation; Krisenkommunikation nach DORA Art. 14 einbinden.",
		domain: "governance",
		evidenceHints: ["Kommunikationsmatrix"],
		auditQuestions: [
			"Wer kommuniziert bei einem schwerwiegenden Vorfall mit Aufsicht, Kunden und Presse?",
		],
		recommendations: [
			{
				level: "should",
				text: "Kommunikationsmatrix mit Vorlagen für Aufsichtsmeldungen und Kundeninformation hinterlegen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.14", "dora:Art.19"],
	},
	{
		code: "7.5",
		sectionCode: "7",
		title: "Dokumentierte Information",
		requirementText:
			"Das ISMS umfasst die von der Norm geforderte und die von der Organisation als notwendig bestimmte dokumentierte Information. Diese wird angemessen gekennzeichnet, formatiert, geprüft und freigegeben sowie gelenkt: Verfügbarkeit, Schutz, Verteilung, Zugriff, Aufbewahrung, Versionierung und Verfügung.",
		guidance:
			"Dokumentenlenkung über ein System mit Versionierung, Freigabe-Workflow und Kenntnisnahme; Metadaten (Owner, Review-Datum, Klassifizierung) sind Pflicht.",
		domain: "governance",
		evidenceHints: ["(P) Dokumentenlenkungsregel"],
		auditQuestions: [
			"Wie stellst du sicher, dass nur die freigegebene Version einer Richtlinie gilt, und wer darf Dokumente ändern?",
		],
		pitfalls: [
			"Richtlinien liegen als Office-Dateien in verschiedenen Versionen auf Laufwerken; niemand weiß, welche gilt.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jedes ISMS-Dokument trägt Owner, Version, Freigabedatum und nächsten Review-Termin; Freigabe und Kenntnisnahme werden protokolliert.",
				source: "ISO 27002",
				ref: "5.37",
			},
		],
		tools: tools(["Confluence", "SharePoint"], ["OpenText"]),
	},
	{
		code: "8.1",
		sectionCode: "8",
		title: "Betriebliche Planung und Steuerung",
		requirementText:
			"Die Organisation plant, verwirklicht und steuert die Prozesse, die zur Erfüllung der Anforderungen und zur Umsetzung der Maßnahmen aus der Planung erforderlich sind, legt Kriterien fest, steuert die Prozesse danach und bewahrt Nachweise auf. Geplante Änderungen werden gesteuert, ungeplante Änderungen und extern bereitgestellte Prozesse bewertet.",
		guidance:
			"Betriebsdokumentation und Runbooks im ITSM; ausgelagerte Prozesse (Cloud, Rechenzentrum) über das Lieferantenmanagement A.5.19–A.5.23 steuern.",
		domain: "governance",
		evidenceHints: ["Betriebsdokumentation"],
		auditQuestions: [
			"Welche ISMS-Prozesse werden extern erbracht, und wie steuerst du diese?",
		],
		recommendations: [
			{
				level: "should",
				text: "Für jeden ISMS-Prozess Kriterien (SLA, KPI) festlegen, an denen du seine Steuerung nachweist.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(1-4)"],
		tools: tools(["ITSM: Jira Service Management"], ["ServiceNow"]),
	},
	{
		code: "8.2",
		sectionCode: "8",
		title: "Risikobeurteilung durchführen",
		requirementText:
			"Die Organisation führt Informationssicherheitsrisikobeurteilungen in geplanten Abständen sowie bei wesentlichen Änderungen nach der Methodik aus 6.1.2 durch und bewahrt die Ergebnisse als dokumentierte Information auf.",
		guidance:
			"Mindestens jährlich sowie anlassbezogen (neuer Dienst, neuer Dienstleister, schwerwiegender Vorfall, neue Lizenzstufe); Auslöser im Change-Prozess verankern.",
		domain: "risk",
		evidenceHints: ["(P) aktuelle Ergebnisse der Risikobeurteilung"],
		auditQuestions: [
			"Wann wurde die letzte vollständige Risikobeurteilung durchgeführt, und welche Anlässe lösen eine außerplanmäßige aus?",
		],
		pitfalls: [
			"Risikobeurteilung nur zum Audittermin, nicht nach Änderungen wie einer Cloud-Migration.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jährlichen Zyklus plus definierte Auslöser (Change, Vorfall, neuer Dienstleister) für eine Neubeurteilung festlegen.",
				source: "ISO 27002",
			},
		],
		relatedRequirements: ["dora:Art.8(5-7)", "nis2:Art.21(2)(a)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "8.3",
		sectionCode: "8",
		title: "Risikobehandlung durchführen",
		requirementText:
			"Die Organisation verwirklicht den Risikobehandlungsplan, verfolgt den Umsetzungsstand der Maßnahmen und bewahrt die Ergebnisse der Risikobehandlung als dokumentierte Information auf.",
		guidance:
			"Behandlungsmaßnahmen als Aufgaben mit Termin und Verantwortlichem führen; Fortschritt und offene Restrisiken quartalsweise an die Geschäftsleitung berichten.",
		domain: "risk",
		evidenceHints: ["(P) aktuelle Ergebnisse der Risikobehandlung"],
		auditQuestions: [
			"Wie weit ist der Risikobehandlungsplan umgesetzt, und welche Maßnahmen sind überfällig?",
		],
		recommendations: [
			{
				level: "must",
				text: "Umsetzungsstand jeder Maßnahme im Risikobehandlungsplan nachhalten; überfällige Maßnahmen im Management-Review eskalieren.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(1-4)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "9.1",
		sectionCode: "9",
		title: "Überwachung, Messung, Analyse und Bewertung",
		requirementText:
			"Die Organisation bestimmt, was überwacht und gemessen wird, mit welchen Methoden, wann, durch wen und wann die Ergebnisse analysiert und bewertet werden, um Informationssicherheitsleistung und Wirksamkeit des ISMS zu bewerten. Die Ergebnisse werden als dokumentierte Information aufbewahrt.",
		guidance:
			"KPI-Report pro Quartal aus GRC-Tool und Monitoring; Messgrößen an den Zielen aus 6.2 ausrichten, Wirksamkeit der Controls regelmäßig testen.",
		domain: "governance",
		evidenceHints: ["(P) Messergebnisse", "KPI-Report"],
		auditQuestions: [
			"Welche Kennzahlen misst du, wie oft, und wie fließen die Ergebnisse in Entscheidungen ein?",
		],
		pitfalls: [
			"Es werden Daten gesammelt, aber nie analysiert oder mit Zielwerten verglichen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Messplan mit Kennzahl, Methode, Frequenz, Verantwortlichem und Zielwert festlegen; Ergebnisse in das Management-Review einspeisen.",
				source: "ISO 27002",
			},
		],
		relatedRequirements: ["dora:Art.24", "nis2:Art.21(2)(f)"],
		tools: tools(["GRC-Tool", "Grafana"]),
	},
	{
		code: "9.2",
		sectionCode: "9",
		title: "Internes Audit",
		requirementText:
			"Die Organisation führt in geplanten Abständen interne Audits durch, um festzustellen, ob das ISMS den eigenen Anforderungen und der Norm entspricht und wirksam verwirklicht ist. Sie plant ein Auditprogramm, legt Kriterien und Umfang fest, wählt objektive und unparteiliche Auditoren, berichtet die Ergebnisse an die zuständige Leitung und bewahrt Programm und Ergebnisse auf.",
		guidance:
			"Kleine Institute beauftragen oft einen externen Dienstleister für das interne Audit; entscheidend ist die Unabhängigkeit vom geprüften Bereich. DORA verlangt zusätzlich Prüfungen des IKT-Risikorahmens durch die Innenrevision.",
		domain: "governance",
		evidenceHints: ["(P) Auditprogramm und -berichte"],
		auditQuestions: [
			"Wie stellst du die Unabhängigkeit der internen Auditoren sicher?",
			"Deckt das Auditprogramm alle Bereiche des ISMS über den Zertifizierungszyklus ab?",
		],
		pitfalls: ["ISB auditiert sein eigenes ISMS."],
		recommendations: [
			{
				level: "must",
				text: "Dreijahres-Auditprogramm, das alle Klauseln und Annex-A-Bereiche abdeckt; Auditoren prüfen nie ihre eigene Arbeit.",
				source: "ISO 27002",
			},
			{
				level: "should",
				text: "Internes Audit mit der Innenrevision nach DORA Art. 6(6) zusammenlegen, um Doppelprüfungen zu vermeiden.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.6(6)", "nis2:Art.21(2)(f)"],
		tools: tools([
			"GRC-Audit-Modul",
			"externer Auditor (z. B. TÜV, DEKRA, usd)",
		]),
	},
	{
		code: "9.3",
		sectionCode: "9",
		title: "Managementbewertung",
		requirementText:
			"Die oberste Leitung bewertet das ISMS in geplanten Abständen, um dessen fortdauernde Eignung, Angemessenheit und Wirksamkeit sicherzustellen. Eingangsgrößen sind u. a. der Status früherer Maßnahmen, Änderungen im Kontext, Rückmeldungen zur Leistung (Nichtkonformitäten, Messergebnisse, Auditergebnisse, Zielerreichung), Rückmeldungen interessierter Parteien, Ergebnisse der Risikobeurteilung und Verbesserungschancen. Ergebnisse sind dokumentierte Entscheidungen und Änderungsbedarf.",
		guidance:
			"Mindestens jährlich, protokolliert mit Entscheidungen und Maßnahmen; bei DORA-Instituten zugleich die jährliche Überprüfung des IKT-Risikorahmens dokumentieren.",
		domain: "governance",
		evidenceHints: ["(P) Protokoll Management-Review"],
		auditQuestions: [
			"Wann fand die letzte Managementbewertung statt, wer nahm teil, und welche Entscheidungen wurden getroffen?",
		],
		pitfalls: [
			"Protokoll enthält nur Anwesenheit und Folien, keine Entscheidungen oder Maßnahmen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Agenda der Managementbewertung entlang der Normeingaben strukturieren und jede Entscheidung mit Verantwortlichem und Termin protokollieren.",
				source: "ISO 27002",
			},
		],
		relatedRequirements: ["dora:Art.6(5)", "nis2:Art.20(1)"],
	},
	{
		code: "10.1",
		sectionCode: "10",
		title: "Fortlaufende Verbesserung",
		requirementText:
			"Die Organisation verbessert fortlaufend die Eignung, Angemessenheit und Wirksamkeit des ISMS.",
		guidance:
			"Verbesserungslog aus Audits, Vorfällen, Messungen und Mitarbeitervorschlägen speisen; Umsetzung im Ticketsystem verfolgen.",
		domain: "governance",
		evidenceHints: ["Verbesserungslog"],
		auditQuestions: [
			"Welche Verbesserungen hast du im letzten Jahr umgesetzt, und woher kamen die Anstöße?",
		],
		recommendations: [
			{
				level: "should",
				text: "Verbesserungen mit Quelle (Audit, Vorfall, Messung, Vorschlag) kennzeichnen und ihren Nutzen im Management-Review bewerten.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.13(1-5)"],
		tools: tools(["Jira"]),
	},
	{
		code: "10.2",
		sectionCode: "10",
		title: "Nichtkonformität und Korrekturmaßnahmen",
		requirementText:
			"Bei einer Nichtkonformität reagiert die Organisation, beherrscht und korrigiert sie, bewertet die Ursachen und prüft, ob ähnliche Nichtkonformitäten bestehen, setzt erforderliche Korrekturmaßnahmen um, überprüft deren Wirksamkeit und passt bei Bedarf das ISMS an. Art der Nichtkonformitäten, Maßnahmen und Ergebnisse werden dokumentiert.",
		guidance:
			"Findings aus internen/externen Audits, Vorfällen und Kontrolltests in einem Findings-Log mit Ursachenanalyse, Maßnahme, Termin und Wirksamkeitsprüfung führen.",
		domain: "governance",
		evidenceHints: ["(P) Nachweis Nichtkonformitäten und Korrekturen"],
		auditQuestions: [
			"Wie behandelst du Nichtkonformitäten, und wie prüfst du die Wirksamkeit der Korrekturmaßnahmen?",
		],
		pitfalls: [
			"Symptom behoben, Ursache nicht analysiert; dasselbe Finding kommt im nächsten Audit wieder.",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jede Nichtkonformität eine Ursachenanalyse und eine Wirksamkeitsprüfung nach Umsetzung dokumentieren.",
				source: "ISO 27002",
			},
		],
		relatedRequirements: ["dora:Art.13(1-5)"],
		tools: tools(["Jira", "GRC-Findings-Log"]),
	},
];

const ANNEX_A5: Draft[] = [
	{
		code: "A.5.1",
		sectionCode: "A.5",
		title: "Informationssicherheitsrichtlinien",
		requirementText:
			"Eine Informationssicherheitsleitlinie und themenspezifische Richtlinien werden festgelegt, von der Leitung genehmigt, veröffentlicht, an relevante Personen und Parteien kommuniziert und bekannt gemacht sowie in geplanten Abständen und bei wesentlichen Änderungen überprüft.",
		guidance:
			"Themenrichtlinien typischerweise zu Zugang, Kryptografie, Backup, Lieferanten, Vorfällen, Entwicklung, Endgeräten, Netz und Klassifizierung (ISO 27002 5.1 nennt Beispiele); Kenntnisnahme elektronisch protokollieren.",
		domain: "governance",
		evidenceHints: ["Leitlinie + Themenrichtlinien"],
		auditQuestions: [
			"Welche themenspezifischen Richtlinien existieren, wann wurden sie zuletzt überprüft, und wie wurde die Kenntnisnahme nachgewiesen?",
		],
		pitfalls: [
			"Richtlinien aus Vorlagen übernommen, ohne sie an die eigene Technik und Organisation anzupassen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jede Richtlinie hat einen Owner, einen jährlichen Review-Termin und einen protokollierten Freigabe- und Kenntnisnahme-Workflow.",
				source: "ISO 27002",
				ref: "5.1",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(a)", "nis2:Art.21(2)(a)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "A.5.2",
		sectionCode: "A.5",
		title: "Informationssicherheitsrollen und -verantwortlichkeiten",
		requirementText:
			"Rollen und Verantwortlichkeiten für Informationssicherheit werden entsprechend den Bedürfnissen der Organisation festgelegt und zugewiesen.",
		guidance:
			"Rollenmodell mit ISB, Asset-Ownern, Risikoeigentümern und Systemverantwortlichen; bei Finanzinstituten zusätzlich die Kontrollfunktionen nach DORA und ZAG-MaRisk abbilden.",
		domain: "governance",
		evidenceHints: ["Rollenmodell"],
		auditQuestions: [
			"Wer ist Eigentümer welcher Informationswerte und Risiken, und wo ist das festgehalten?",
		],
		relatedRequirements: ["dora:Art.5(2)"],
	},
	{
		code: "A.5.3",
		sectionCode: "A.5",
		title: "Aufgabentrennung",
		requirementText:
			"Einander widersprechende Aufgaben und Verantwortungsbereiche werden getrennt, um Missbrauch sowie unbefugte oder unbeabsichtigte Änderungen zu vermeiden.",
		guidance:
			"Kritische Trennungen im Zahlungs-/Kryptoumfeld: Zahlungserfassung vs. -freigabe, Schlüsselzeremonie vs. Betrieb, Entwicklung vs. Produktionsdeployment, Berechtigungsvergabe vs. -prüfung. Wo Trennung in kleinen Teams unmöglich ist, kompensierende Kontrollen (Vier-Augen, Logging) dokumentieren.",
		domain: "governance",
		evidenceHints: ["SoD-Matrix"],
		auditQuestions: [
			"Welche unvereinbaren Funktionen hast du identifiziert, und wie ist die Trennung technisch durchgesetzt?",
		],
		pitfalls: [
			"Ein Administrator kann Zahlungen auslösen, freigeben und die Protokolle löschen.",
		],
		recommendations: [
			{
				level: "must",
				text: "SoD-Matrix für Zahlungsfreigabe, Schlüsselverwaltung, Deployment und Berechtigungsvergabe erstellen und im IAM technisch durchsetzen.",
				source: "ISO 27002",
				ref: "5.3",
			},
			{
				level: "should",
				text: "SoD-Konflikte bei Rezertifizierungen (A.5.18) automatisch prüfen lassen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(c)"],
		tools: tools(["IAM: Entra ID Governance", "Okta Identity Governance"]),
	},
	{
		code: "A.5.4",
		sectionCode: "A.5",
		title: "Verantwortlichkeiten der Leitung",
		requirementText:
			"Die Leitung fordert von allen Personen, die Informationssicherheitspolitik, die Themenrichtlinien und die Verfahren der Organisation anzuwenden.",
		guidance:
			"Führungskräfte verpflichten sich schriftlich, Vorgaben einzufordern; Nachweise über Briefings, Zielvereinbarungen und Reaktion auf Verstöße.",
		domain: "governance",
		evidenceHints: ["Verpflichtungserklärungen"],
		auditQuestions: [
			"Wie stellen Führungskräfte sicher, dass ihre Teams die Sicherheitsvorgaben kennen und einhalten?",
		],
		relatedRequirements: ["dora:Art.5(2)", "nis2:Art.20(1)"],
	},
	{
		code: "A.5.5",
		sectionCode: "A.5",
		title: "Kontakt mit Behörden",
		requirementText:
			"Die Organisation stellt Kontakte zu relevanten Behörden her und unterhält sie.",
		guidance:
			"Liste mit Ansprechpartnern und Meldewegen: BaFin (Vorfälle, Anzeigen), Bundesbank, BSI (Registrierung, Warnungen), FIU (Verdachtsmeldungen), LKA/Polizei (Cybercrime), Datenschutzaufsicht; Meldefristen je Regime hinterlegen.",
		domain: "governance",
		evidenceHints: ["Behördenliste (BaFin, Bundesbank, BSI, FIU, LKA)"],
		auditQuestions: [
			"Wen kontaktierst du bei einem Cyberangriff, und innerhalb welcher Fristen?",
		],
		pitfalls: [
			"Behördenliste existiert, aber Meldeportale und Zugangsdaten sind nicht eingerichtet.",
		],
		relatedRequirements: ["dora:Art.19", "nis2:Art.23"],
	},
	{
		code: "A.5.6",
		sectionCode: "A.5",
		title: "Kontakt mit speziellen Interessengruppen",
		requirementText:
			"Die Organisation unterhält Kontakte zu Interessengruppen, Sicherheitsforen und Fachverbänden, um Informationen über Bedrohungen, Schwachstellen und gute Praxis zu erhalten.",
		guidance:
			"Mitgliedschaft in der Allianz für Cybersicherheit (BSI, kostenlos), ggf. FS-ISAC oder Branchenverbände; Beteiligung am freiwilligen Informationsaustausch nach DORA Art. 45.",
		domain: "governance",
		evidenceHints: ["Mitgliedschaften"],
		auditQuestions: [
			"In welchen Fachgremien oder Informationsnetzwerken bist du aktiv?",
		],
		relatedRequirements: ["dora:Art.45", "nis2:Art.29"],
		tools: tools(["Allianz für Cybersicherheit", "FS-ISAC", "Bitkom"]),
	},
	{
		code: "A.5.7",
		sectionCode: "A.5",
		title: "Bedrohungsintelligenz",
		requirementText:
			"Informationen über Informationssicherheitsbedrohungen werden gesammelt, analysiert und zu Bedrohungsintelligenz verarbeitet, die in Risikobeurteilung, Schutzmaßnahmen und Überwachung einfließt.",
		guidance:
			"Start mit CERT-Bund-Warnungen, Herstellerhinweisen und kryptospezifischen Quellen (Exploits auf Chains, Phishing gegen Wallet-Nutzer); Prozess: Quelle, Bewertung, Maßnahme, Nachweis. Strategische, taktische und operative Ebene unterscheiden (ISO 27002 5.7).",
		domain: "governance",
		evidenceHints: ["Threat-Intel-Prozess"],
		auditQuestions: [
			"Welche Bedrohungsquellen wertest du aus, und wie fließen Erkenntnisse in Maßnahmen ein?",
		],
		pitfalls: [
			"Newsletter-Abonnements ohne Bewertung und ohne dokumentierte Reaktion.",
		],
		recommendations: [
			{
				level: "must",
				text: "Mindestens CERT-Bund und Herstellerhinweise der eingesetzten Systeme abonnieren und wöchentlich dokumentiert bewerten.",
				source: "BSI IT-Grundschutz",
			},
			{
				level: "could",
				text: "Kommerzielle Threat-Intel mit Fokus auf Krypto-Bedrohungen ab der Skalierungsphase.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.13(1-5)", "dora:Art.10", "nis2:Art.29"],
		tools: tools(
			["CERT-Bund-Warnungen (kostenlos)"],
			["Recorded Future", "Mandiant", "TRM/Chainalysis Threat Intel"],
		),
	},
	{
		code: "A.5.8",
		sectionCode: "A.5",
		title: "Informationssicherheit im Projektmanagement",
		requirementText:
			"Informationssicherheit wird unabhängig von der Art des Projekts in das Projektmanagement integriert.",
		guidance:
			"Sicherheitscheckliste als Pflichtschritt in der Projektvorlage: Schutzbedarf, Risikobeurteilung, Datenschutz, Lieferanten, Abnahmetests.",
		domain: "governance",
		evidenceHints: ["Projekt-Sicherheitscheckliste"],
		auditQuestions: [
			"Wie wird Informationssicherheit in Projekten berücksichtigt, und wer gibt die Sicherheitsanforderungen frei?",
		],
		pitfalls: ["Sicherheit wird erst kurz vor dem Go-live betrachtet."],
		relatedRequirements: ["dora:Art.8(5-7)"],
		tools: tools(["Jira-Vorlagen"]),
	},
	{
		code: "A.5.9",
		sectionCode: "A.5",
		title: "Inventar der Informationen und Werte",
		requirementText:
			"Ein Inventar der Informationen und anderen damit verbundenen Werte einschließlich ihrer Eigentümer wird erstellt und gepflegt.",
		guidance:
			"Inventar umfasst Hardware, Software, Cloud-Ressourcen, Datenbestände, Schlüssel/Wallets, Dienstleister und Geschäftsprozesse; Cloud-Assets automatisiert erfassen. DORA Art. 8 verlangt zusätzlich die Zuordnung zu Geschäftsfunktionen und Kritikalität.",
		domain: "asset",
		evidenceHints: ["Asset-Inventar"],
		auditQuestions: [
			"Wie vollständig und aktuell ist dein Asset-Inventar, und wer ist Eigentümer der kritischen Werte?",
		],
		pitfalls: [
			"Inventar erfasst nur Laptops; Cloud-Ressourcen, SaaS-Dienste und Datenbestände fehlen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Inventar automatisiert aus MDM, Cloud-APIs und IdP speisen und je Asset Owner, Klassifizierung und Kritikalität pflegen.",
				source: "ISO 27002",
				ref: "5.9",
			},
		],
		relatedRequirements: ["dora:Art.8(1-4)", "nis2:Art.21(2)(i)"],
		tools: tools(
			["Snipe-IT", "Lansweeper"],
			["ServiceNow CMDB", "Cloud: Wiz, AWS Config"],
		),
	},
	{
		code: "A.5.10",
		sectionCode: "A.5",
		title: "Zulässiger Gebrauch von Informationen und Werten",
		requirementText:
			"Regeln für den zulässigen Gebrauch und Verfahren für den Umgang mit Informationen und anderen damit verbundenen Werten werden festgelegt, dokumentiert und umgesetzt.",
		guidance:
			"Acceptable Use Policy als Teil des Onboardings mit Kenntnisnahme; Regeln zu Privatnutzung, Cloud-Diensten, KI-Tools und Wechseldatenträgern.",
		domain: "asset",
		evidenceHints: ["Acceptable Use Policy"],
		auditQuestions: [
			"Welche Nutzungsregeln gelten für Mitarbeitende, und wie wurde ihre Kenntnisnahme nachgewiesen?",
		],
	},
	{
		code: "A.5.11",
		sectionCode: "A.5",
		title: "Rückgabe von Werten",
		requirementText:
			"Mitarbeitende und andere Parteien geben alle Werte der Organisation in ihrem Besitz zurück, wenn ihre Beschäftigung, ihr Vertrag oder ihre Vereinbarung endet oder sich ändert.",
		guidance:
			"Austrittscheckliste im HR-System mit Geräten, Token, Schlüsseln und Zugangskarten; MDM-Remote-Wipe für nicht zurückgegebene Geräte.",
		domain: "asset",
		evidenceHints: ["Austrittscheckliste"],
		auditQuestions: [
			"Wie stellst du sicher, dass beim Austritt alle Geräte und Zugangsmittel zurückgegeben werden?",
		],
		pitfalls: [
			"Hardware-Token und Recovery-Codes für Wallets werden bei der Rückgabe vergessen.",
		],
		tools: tools(["Personio + Intune"]),
	},
	{
		code: "A.5.12",
		sectionCode: "A.5",
		title: "Klassifizierung von Informationen",
		requirementText:
			"Informationen werden nach den Informationssicherheitsbedürfnissen der Organisation auf Grundlage von Vertraulichkeit, Integrität, Verfügbarkeit und relevanten Anforderungen interessierter Parteien klassifiziert.",
		guidance:
			"Vier Stufen (öffentlich, intern, vertraulich, geheim) reichen; Kundendaten, Transaktionsdaten und Schlüsselmaterial grundsätzlich vertraulich oder höher. Schema mit der DORA-Kritikalität der Funktionen verzahnen.",
		domain: "asset",
		evidenceHints: ["Klassifizierungsschema"],
		auditQuestions: [
			"Welches Klassifizierungsschema nutzt du, und wie sind Kunden- und Transaktionsdaten eingestuft?",
		],
		recommendations: [
			{
				level: "must",
				text: "Klassifizierungsschema mit konkreten Handhabungsregeln je Stufe (Speicherung, Übertragung, Löschung) verbinden.",
				source: "ISO 27002",
				ref: "5.12",
			},
		],
		relatedRequirements: ["dora:Art.8(1-4)"],
		tools: tools(["Microsoft Purview Information Protection"]),
	},
	{
		code: "A.5.13",
		sectionCode: "A.5",
		title: "Kennzeichnung von Informationen",
		requirementText:
			"Geeignete Verfahren zur Kennzeichnung von Informationen entsprechend dem Klassifizierungsschema werden entwickelt und umgesetzt.",
		guidance:
			"Labels in M365/Google Workspace automatisch oder als Vorgabe setzen; Kennzeichnung auf Dokumenten, E-Mails und Datenträgern.",
		domain: "asset",
		evidenceHints: ["Labeling-Regeln"],
		auditQuestions: [
			"Wie werden Dokumente und Daten entsprechend ihrer Klassifizierung gekennzeichnet?",
		],
		pitfalls: [
			"Klassifizierungsschema existiert, aber kein Dokument trägt ein Label.",
		],
		tools: tools(["Microsoft Purview"]),
	},
	{
		code: "A.5.14",
		sectionCode: "A.5",
		title: "Informationsübertragung",
		requirementText:
			"Regeln, Verfahren oder Vereinbarungen für die Übertragung von Informationen innerhalb der Organisation und mit anderen Parteien werden für alle Arten von Übertragungseinrichtungen festgelegt.",
		guidance:
			"TLS 1.2+ für alle Verbindungen, verschlüsselte Dateiübertragung statt E-Mail-Anhang für vertrauliche Daten, Vereinbarungen mit Partnern über Übertragungswege; gesicherte Notfallkommunikation nach NIS2 mitdenken.",
		domain: "asset",
		evidenceHints: ["Übertragungsrichtlinie"],
		auditQuestions: [
			"Über welche Kanäle dürfen vertrauliche Informationen übertragen werden, und wie wird das durchgesetzt?",
		],
		relatedRequirements: ["dora:Art.9(2)", "nis2:Art.21(2)(j)"],
		tools: tools([
			"TLS",
			"Tresorit",
			"Boxcryptor-Nachfolger (Dropbox)",
			"S/MIME",
		]),
	},
	{
		code: "A.5.15",
		sectionCode: "A.5",
		title: "Zugangssteuerung",
		requirementText:
			"Regeln zur Steuerung des physischen und logischen Zugangs zu Informationen und anderen Werten werden auf Grundlage geschäftlicher und sicherheitsbezogener Anforderungen festgelegt und umgesetzt.",
		guidance:
			"Zugangsrichtlinie nach Need-to-know und Least Privilege, rollenbasiert (RBAC) über den zentralen IdP; Ausnahmen genehmigt und befristet.",
		domain: "access",
		evidenceHints: ["Zugangsrichtlinie"],
		auditQuestions: [
			"Nach welchen Regeln werden Zugänge vergeben, und wie setzt du Need-to-know durch?",
		],
		pitfalls: [
			"Zugänge werden per Zuruf vergeben; es gibt kein Rollenkonzept.",
		],
		recommendations: [
			{
				level: "must",
				text: "Zugangsrichtlinie mit Rollenkonzept, Genehmigungsweg und Entzugsregeln festlegen; alle Anwendungen an den zentralen IdP anbinden.",
				source: "ISO 27002",
				ref: "5.15",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(c)", "nis2:Art.21(2)(i)"],
		tools: tools(["Entra ID", "Okta"]),
	},
	{
		code: "A.5.16",
		sectionCode: "A.5",
		title: "Identitätsmanagement",
		requirementText:
			"Der gesamte Lebenszyklus von Identitäten wird verwaltet: eindeutige Zuordnung zu Personen oder Systemen, Anlegen, Änderung und Löschung sowie der Umgang mit gemeinsam genutzten Identitäten.",
		guidance:
			"Joiner-Mover-Leaver-Prozess mit HR-System als Quelle, automatische Provisionierung über den IdP, Sperrung am Austrittstag; Shared Accounts nur als dokumentierte Ausnahme.",
		domain: "access",
		evidenceHints: ["Joiner-Mover-Leaver-Prozess"],
		auditQuestions: [
			"Wie schnell wird ein Konto nach Austritt deaktiviert, und wie wird das nachgewiesen?",
			"Gibt es gemeinsam genutzte Konten, und wie sind sie abgesichert?",
		],
		pitfalls: [
			"Konten ehemaliger Mitarbeitender bleiben in SaaS-Diensten aktiv, die nicht am IdP hängen.",
		],
		recommendations: [
			{
				level: "must",
				text: "HR-System als führende Quelle an den IdP koppeln; der Austritt deaktiviert alle Zugänge automatisch am selben Tag.",
				source: "ISO 27002",
				ref: "5.16",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(c)"],
		tools: tools(["Entra ID", "Okta", "Personio-Kopplung"]),
	},
	{
		code: "A.5.17",
		sectionCode: "A.5",
		title: "Authentisierungsinformationen",
		requirementText:
			"Zuweisung und Verwaltung von Authentisierungsinformationen werden durch einen Prozess gesteuert, der auch die Beratung der Personen zum korrekten Umgang damit umfasst.",
		guidance:
			"Passwortmanager für alle, MFA-Pflicht (bevorzugt FIDO2), Regeln zur Erstvergabe und Rücksetzung mit Identitätsprüfung, Verbot der Weitergabe; Service-Credentials im Secret-Vault.",
		domain: "access",
		evidenceHints: ["Passwort-/MFA-Richtlinie"],
		auditQuestions: [
			"Wie werden Erstpasswörter übergeben und zurückgesetzt, und wie wird die Identität dabei geprüft?",
		],
		recommendations: [
			{
				level: "must",
				text: "Unternehmensweiten Passwortmanager und Phishing-resistente MFA (FIDO2) für alle Konten vorschreiben; Secrets von Diensten in einem Vault verwalten.",
				source: "ISO 27002",
				ref: "5.17",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(d)", "nis2:Art.21(2)(j)"],
		tools: tools(["1Password Business", "Bitwarden", "YubiKey FIDO2"]),
	},
	{
		code: "A.5.18",
		sectionCode: "A.5",
		title: "Zugangsrechte",
		requirementText:
			"Zugangsrechte zu Informationen und anderen Werten werden gemäß der Zugangsrichtlinie bereitgestellt, überprüft, geändert und entzogen.",
		guidance:
			"Rezertifizierung privilegierter Rechte quartalsweise, aller anderen mindestens jährlich; Ergebnisse mit Entzug protokollieren. Access Reviews im IdP automatisieren.",
		domain: "access",
		evidenceHints: ["Rezertifizierungsprotokolle"],
		auditQuestions: [
			"Wann wurden Zugangsrechte zuletzt rezertifiziert, und welche Rechte wurden entzogen?",
		],
		pitfalls: [
			"Rezertifizierung ist ein Abnicken ohne tatsächliche Prüfung; nie wird etwas entzogen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Regelmäßige Rezertifizierung durch die Fachverantwortlichen mit dokumentiertem Ergebnis und Entzug nicht mehr benötigter Rechte.",
				source: "ISO 27002",
				ref: "5.18",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(c)", "nis2:Art.21(2)(i)"],
		tools: tools(["Entra ID Access Reviews"], ["SailPoint", "Saviynt"]),
	},
	{
		code: "A.5.19",
		sectionCode: "A.5",
		title: "Informationssicherheit in Lieferantenbeziehungen",
		requirementText:
			"Prozesse und Verfahren werden festgelegt und umgesetzt, um die Informationssicherheitsrisiken zu steuern, die mit der Nutzung von Produkten oder Dienstleistungen von Lieferanten verbunden sind.",
		guidance:
			"Lieferantenrichtlinie mit Kritikalitätsklassen, Due-Diligence-Umfang und Überwachungsrhythmus; für DORA das Informationsregister aller IKT-Dienstleister führen und kritische oder wichtige Funktionen kennzeichnen.",
		domain: "supplier",
		evidenceHints: ["Lieferantenrichtlinie"],
		auditQuestions: [
			"Wie bewertest du das Sicherheitsrisiko neuer Lieferanten, und welche Lieferanten gelten als kritisch?",
		],
		pitfalls: [
			"SaaS-Tools werden per Kreditkarte ohne Sicherheitsprüfung eingeführt (Schatten-IT).",
		],
		recommendations: [
			{
				level: "must",
				text: "Lieferantenregister mit Kritikalität, Due-Diligence-Ergebnis, Vertragsstatus und Überwachungstermin führen; identisch mit dem DORA-Informationsregister.",
				source: "intern",
			},
			{
				level: "should",
				text: "Due Diligence je Kritikalität abstufen: Fragebogen und Zertifikate für Standard, Audit-Recht und Exit-Plan für kritische Dienstleister.",
				source: "ISO 27002",
				ref: "5.19",
			},
		],
		relatedRequirements: [
			"dora:Art.28(1-2)",
			"dora:Art.28(3)",
			"nis2:Art.21(2)(d)",
		],
		tools: TPRM_TOOLS,
	},
	{
		code: "A.5.20",
		sectionCode: "A.5",
		title: "Informationssicherheit in Lieferantenvereinbarungen",
		requirementText:
			"Relevante Informationssicherheitsanforderungen werden mit jedem Lieferanten entsprechend der Art der Lieferantenbeziehung vereinbart und in der Vereinbarung festgehalten.",
		guidance:
			"Vertragsklauseln zu Vertraulichkeit, Sicherheitsniveau, Vorfallmeldung, Audit-Rechten, Subunternehmern, Datenort und Kündigung; bei kritischen IKT-Dienstleistern die Pflichtinhalte nach DORA Art. 30 nutzen.",
		domain: "supplier",
		evidenceHints: ["Vertragsklauseln"],
		auditQuestions: [
			"Enthalten deine Verträge mit IKT-Dienstleistern Sicherheits-, Melde- und Prüfrechte?",
		],
		pitfalls: [
			"Standard-AGB des Cloud-Anbieters akzeptiert, ohne DORA-Pflichtklauseln nachzuverhandeln.",
		],
		relatedRequirements: ["dora:Art.30", "nis2:Art.21(2)(d)"],
	},
	{
		code: "A.5.21",
		sectionCode: "A.5",
		title: "Informationssicherheit in der IKT-Lieferkette",
		requirementText:
			"Prozesse und Verfahren werden festgelegt und umgesetzt, um die mit der Lieferkette von IKT-Produkten und -Dienstleistungen verbundenen Informationssicherheitsrisiken zu steuern.",
		guidance:
			"Sub-Dienstleister kritischer Anbieter erfassen (Cloud-Unterauftragnehmer, Node-Provider, Custody-Technik), Konzentrationsrisiken bewerten; Software-Lieferkette (SBOM, Signaturen) einschließen.",
		domain: "supplier",
		evidenceHints: ["Sub-Dienstleister-Analyse"],
		auditQuestions: [
			"Kennst du die wesentlichen Unterauftragnehmer deiner kritischen Dienstleister, und wie bewertest du Konzentrationsrisiken?",
		],
		relatedRequirements: [
			"dora:Art.28(4-6)",
			"dora:Art.29",
			"dora:RTS2025/532",
		],
		tools: TPRM_TOOLS,
	},
	{
		code: "A.5.22",
		sectionCode: "A.5",
		title:
			"Überwachung und Änderungsmanagement von Lieferantendienstleistungen",
		requirementText:
			"Die Organisation überwacht, überprüft und bewertet regelmäßig Änderungen in den Informationssicherheitspraktiken und der Leistungserbringung ihrer Lieferanten.",
		guidance:
			"Jährliches Review je kritischem Lieferanten: SOC-2-/ISAE-3402-/C5-Berichte lesen und Abweichungen (CUECs, Ausnahmen) bewerten, SLA-Reports und Vorfälle einbeziehen.",
		domain: "supplier",
		evidenceHints: ["Jährliche Reviews", "SOC-2-/ISAE-3402-Berichte"],
		auditQuestions: [
			"Wie überwachst du Leistung und Sicherheit deiner kritischen Dienstleister im laufenden Betrieb?",
		],
		pitfalls: [
			"Prüfberichte werden abgelegt, aber nie gelesen; Ausnahmen bleiben unbewertet.",
		],
		relatedRequirements: ["dora:Art.28(1-2)", "nis2:Art.21(2)(d)"],
		tools: TPRM_TOOLS,
	},
	{
		code: "A.5.23",
		sectionCode: "A.5",
		title: "Informationssicherheit bei Cloud-Diensten",
		requirementText:
			"Prozesse für Beschaffung, Nutzung, Verwaltung und Beendigung von Cloud-Diensten werden entsprechend den Informationssicherheitsanforderungen der Organisation festgelegt.",
		guidance:
			"Cloud-Richtlinie mit Freigabeprozess, Datenresidenz (EU/Frankfurt), Shared-Responsibility-Zuordnung, C5- oder ISO-Testat als Mindestanforderung und dokumentierter Exit-Strategie je kritischem Dienst (DORA Art. 28).",
		domain: "supplier",
		evidenceHints: ["Cloud-Richtlinie", "Exit-Plan"],
		auditQuestions: [
			"Welche Cloud-Dienste nutzt du, wo liegen die Daten, und wie sieht dein Exit-Plan für kritische Dienste aus?",
		],
		pitfalls: [
			"Exit-Plan ist eine Absichtserklärung ohne getesteten Export und ohne Alternativanbieter.",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jeden kritischen Cloud-Dienst Shared-Responsibility-Matrix, Datenstandort und Exit-Strategie dokumentieren.",
				source: "ISO 27002",
				ref: "5.23",
			},
			{
				level: "should",
				text: "Nur Anbieter mit aktuellem BSI-C5- oder ISO-27001-Testat zulassen und das Testat jährlich prüfen.",
				source: "BSI IT-Grundschutz",
				ref: "OPS.2.2",
			},
		],
		relatedRequirements: [
			"dora:Art.28(7-8)",
			"dora:Art.28(4-6)",
			"nis2:Art.21(2)(d)",
		],
		tools: tools(["AWS/Azure/Google (Region Frankfurt)", "BSI C5-Testate"]),
	},
	{
		code: "A.5.24",
		sectionCode: "A.5",
		title: "Planung und Vorbereitung der Vorfallhandhabung",
		requirementText:
			"Die Organisation plant und bereitet die Handhabung von Informationssicherheitsvorfällen vor, indem sie Prozesse, Rollen und Verantwortlichkeiten für das Vorfallmanagement festlegt, dokumentiert und kommuniziert.",
		guidance:
			"Incident-Response-Plan mit Rollen, Eskalationswegen, Erreichbarkeiten, Kommunikationsvorlagen und den DORA-Meldefristen (Erstmeldung 4 h nach Einstufung bzw. 24 h nach Kenntnis, Zwischenmeldung 72 h, Abschlussmeldung 1 Monat); jährlich üben.",
		domain: "incident",
		evidenceHints: ["Incident-Response-Plan"],
		auditQuestions: [
			"Wer ist im Vorfallteam, wie wird eskaliert, und wann wurde der Plan zuletzt geübt?",
		],
		pitfalls: [
			"Plan existiert, aber Erreichbarkeiten sind veraltet und niemand kennt die Meldefristen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Incident-Response-Plan mit Rollen, 24/7-Erreichbarkeit, Klassifizierung und Aufsichtsmeldewegen festlegen und mindestens jährlich in einer Übung testen.",
				source: "ISO 27002",
				ref: "5.24",
			},
			{
				level: "should",
				text: "Meldefristen und Vorlagen für BaFin (DORA), BSI und Datenschutzaufsicht direkt im Plan hinterlegen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.17", "dora:Art.19", "nis2:Art.21(2)(b)"],
		tools: tools(["Jira Service Management", "PagerDuty", "Opsgenie"]),
	},
	{
		code: "A.5.25",
		sectionCode: "A.5",
		title: "Beurteilung und Entscheidung über Ereignisse",
		requirementText:
			"Informationssicherheitsereignisse werden beurteilt, und es wird entschieden, ob sie als Informationssicherheitsvorfälle einzustufen sind.",
		guidance:
			"Klassifizierungsschema mit Schweregraden, das die DORA-Kriterien für schwerwiegende Vorfälle (Art. 18, RTS 2024/1772) direkt abbildet; Entscheidung und Begründung im Ticket dokumentieren.",
		domain: "incident",
		evidenceHints: ["Klassifizierungsschema"],
		auditQuestions: [
			"Nach welchen Kriterien entscheidest du, ob ein Ereignis ein Vorfall ist und ob er meldepflichtig wird?",
		],
		recommendations: [
			{
				level: "must",
				text: "Ereignisklassifizierung mit den DORA-Schwellenwerten für schwerwiegende Vorfälle verzahnen, damit die Meldefrist ab Einstufung sicher eingehalten wird.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.18", "dora:Art.17", "nis2:Art.21(2)(b)"],
	},
	{
		code: "A.5.26",
		sectionCode: "A.5",
		title: "Reaktion auf Informationssicherheitsvorfälle",
		requirementText:
			"Auf Informationssicherheitsvorfälle wird gemäß den dokumentierten Verfahren reagiert: Eindämmung, Beweissicherung, Eskalation, Kommunikation, Beseitigung und Wiederherstellung.",
		guidance:
			"Playbooks für die häufigsten Szenarien (Ransomware, Kontoübernahme, Wallet-Kompromittierung, Datenabfluss, DDoS); Reaktionsschritte im Ticket protokollieren.",
		domain: "incident",
		evidenceHints: ["Playbooks"],
		auditQuestions: [
			"Welche Playbooks existieren, und wie wurde beim letzten Vorfall danach gearbeitet?",
		],
		pitfalls: [
			"Reaktion improvisiert; Zeitstempel und Entscheidungen sind später nicht rekonstruierbar.",
		],
		recommendations: [
			{
				level: "must",
				text: "Playbooks für mindestens fünf Kernszenarien inklusive Schlüssel- und Wallet-Kompromittierung erstellen und jährlich testen.",
				source: "ISO 27002",
				ref: "5.26",
			},
		],
		relatedRequirements: ["dora:Art.17", "nis2:Art.21(2)(b)"],
		tools: tools(["SOAR: Sentinel Playbooks", "Tines", "Splunk SOAR"]),
	},
	{
		code: "A.5.27",
		sectionCode: "A.5",
		title: "Erkenntnisse aus Informationssicherheitsvorfällen",
		requirementText:
			"Erkenntnisse aus Informationssicherheitsvorfällen werden genutzt, um die Sicherheitsmaßnahmen zu stärken und zu verbessern.",
		guidance:
			"Post-Mortem nach jedem schwerwiegenden Vorfall (Ursache, Zeitachse, Maßnahmen); Ergebnisse in Risikoregister und Verbesserungslog. DORA Art. 13 verlangt genau diese Nachbereitung.",
		domain: "incident",
		evidenceHints: ["Post-Mortems"],
		auditQuestions: [
			"Welche Verbesserungen wurden aus den Vorfällen der letzten zwölf Monate abgeleitet?",
		],
		recommendations: [
			{
				level: "must",
				text: "Für jeden schwerwiegenden Vorfall ein Post-Mortem mit Ursachenanalyse und nachverfolgten Maßnahmen dokumentieren.",
				source: "ISO 27002",
				ref: "5.27",
			},
		],
		relatedRequirements: ["dora:Art.13(1-5)", "nis2:Art.21(2)(b)"],
		tools: tools(["Jira", "Confluence"]),
	},
	{
		code: "A.5.28",
		sectionCode: "A.5",
		title: "Sammeln von Beweismaterial",
		requirementText:
			"Die Organisation legt Verfahren zur Identifizierung, Sammlung, Erfassung und Aufbewahrung von Beweismaterial zu Informationssicherheitsereignissen fest und wendet sie an.",
		guidance:
			"Forensik-Leitfaden mit Beweiskette (Chain of Custody), Image-Erstellung, Log-Sicherung und Hash-Nachweisen; ein Retainer mit einem Forensik-Dienstleister spart im Ernstfall Tage.",
		domain: "incident",
		evidenceHints: ["Forensik-Leitfaden"],
		auditQuestions: [
			"Wie sicherst du Beweise gerichtsfest, und wer unterstützt dich bei forensischen Analysen?",
		],
		pitfalls: [
			"Kompromittierte Systeme werden neu aufgesetzt, bevor Beweise gesichert sind.",
		],
		recommendations: [
			{
				level: "should",
				text: "Forensik-Retainer mit einem spezialisierten Dienstleister abschließen und die Beweissicherung in den Playbooks verankern.",
				source: "ISO 27002",
				ref: "5.28",
			},
		],
		relatedRequirements: ["dora:Art.17", "nis2:Art.21(2)(b)"],
		tools: tools([
			"Velociraptor",
			"Magnet AXIOM",
			"Retainer: Mandiant, CrowdStrike, HiSolutions",
		]),
	},
	{
		code: "A.5.29",
		sectionCode: "A.5",
		title: "Informationssicherheit bei Störungen",
		requirementText:
			"Die Organisation plant, wie Informationssicherheit während einer Störung auf angemessenem Niveau aufrechterhalten wird.",
		guidance:
			"Notfallvorgaben, die Sicherheitsanforderungen auch im Notbetrieb festlegen (kein unverschlüsselter Workaround, kein Shared-Admin); Krisenstab und Krisenkommunikation nach DORA Art. 11(7) definieren.",
		domain: "continuity",
		evidenceHints: ["Notfall-Sicherheitsvorgaben"],
		auditQuestions: [
			"Welche Sicherheitsanforderungen gelten im Notbetrieb, und wie werden sie durchgesetzt?",
		],
		relatedRequirements: [
			"dora:Art.11(1-2)",
			"dora:Art.11(7)",
			"nis2:Art.21(2)(c)",
		],
		tools: tools(["HiScout BCM", "Fusion"]),
	},
	{
		code: "A.5.30",
		sectionCode: "A.5",
		title: "IKT-Bereitschaft für Business Continuity",
		requirementText:
			"Die IKT-Bereitschaft wird auf Grundlage der Business-Continuity-Ziele und der IKT-Kontinuitätsanforderungen geplant, umgesetzt, aufrechterhalten und getestet.",
		guidance:
			"BIA je Geschäftsprozess mit RTO/RPO, daraus IKT-Kontinuitätspläne ableiten; mindestens jährlicher Wiederanlauftest inklusive Cloud-Region-Ausfall und Wallet-Wiederherstellung, Ergebnisse dokumentieren.",
		domain: "continuity",
		evidenceHints: ["BIA", "Wiederanlauftests"],
		auditQuestions: [
			"Welche RTO/RPO gelten für deine kritischen Prozesse, und wann wurde der Wiederanlauf zuletzt getestet?",
		],
		pitfalls: [
			"Backups vorhanden, aber der Wiederanlauf im Ganzen wurde nie geübt; RTO ist eine Annahme.",
		],
		recommendations: [
			{
				level: "must",
				text: "BIA mit RTO/RPO je kritischer Funktion, IKT-Kontinuitätspläne und mindestens jährlicher dokumentierter Test, wie DORA Art. 11 verlangt.",
				source: "ISO 27002",
				ref: "5.30",
			},
			{
				level: "should",
				text: "Testszenarien jährlich wechseln (Rechenzentrumsausfall, Ransomware, Dienstleisterausfall, Schlüsselverlust).",
				source: "intern",
			},
		],
		relatedRequirements: [
			"dora:Art.11(5)",
			"dora:Art.11(6)",
			"nis2:Art.21(2)(c)",
		],
		tools: tools(["Veeam", "Rubrik", "Multi-AZ-Cloud"]),
	},
	{
		code: "A.5.31",
		sectionCode: "A.5",
		title: "Rechtliche, regulatorische und vertragliche Anforderungen",
		requirementText:
			"Die für die Informationssicherheit relevanten rechtlichen, gesetzlichen, regulatorischen und vertraglichen Anforderungen sowie der Ansatz zu ihrer Erfüllung werden ermittelt, dokumentiert und aktuell gehalten.",
		guidance:
			"Rechtskataster mit Quelle, Pflicht, Verantwortlichem, Nachweis und Review-Datum: DORA, MiCAR, ZAG, GwG, DSGVO, BSIG, TKG; regulatorisches Horizon Scanning als wiederkehrende Aufgabe.",
		domain: "compliance",
		evidenceHints: ["Rechtskataster"],
		auditQuestions: [
			"Welche gesetzlichen und aufsichtlichen Anforderungen betreffen dein ISMS, und wie hältst du das Kataster aktuell?",
		],
		pitfalls: [
			"Rechtskataster listet Gesetze, aber keine konkreten Pflichten und keine Verantwortlichen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Rechtskataster auf Pflichtenebene führen (Artikel oder Paragraph, Pflicht, Nachweis) und quartalsweise auf Änderungen prüfen.",
				source: "ISO 27002",
				ref: "5.31",
			},
		],
		relatedRequirements: ["nis2:Art.21(1)"],
		tools: tools([
			"GRC-Tool",
			"Haufe Compliance",
			"regulatorisches Horizon Scanning (FIS-Rechtskataster, PwC Plus)",
		]),
	},
	{
		code: "A.5.32",
		sectionCode: "A.5",
		title: "Geistige Eigentumsrechte",
		requirementText:
			"Die Organisation setzt geeignete Verfahren zum Schutz geistiger Eigentumsrechte um, insbesondere zur lizenzkonformen Nutzung von Software.",
		guidance:
			"Lizenzverzeichnis aus dem Software-Inventar; Open-Source-Lizenzen in eigenen Produkten prüfen (SBOM, Lizenz-Scanner).",
		domain: "compliance",
		evidenceHints: ["Lizenzverzeichnis"],
		auditQuestions: [
			"Wie stellst du sicher, dass eingesetzte Software lizenzkonform genutzt wird?",
		],
		tools: tools(["Lansweeper", "FlexNet"]),
	},
	{
		code: "A.5.33",
		sectionCode: "A.5",
		title: "Schutz von Aufzeichnungen",
		requirementText:
			"Aufzeichnungen werden vor Verlust, Zerstörung, Fälschung, unbefugtem Zugriff und unbefugter Veröffentlichung geschützt.",
		guidance:
			"Aufbewahrungs- und Löschkonzept je Datenart (GwG 5 Jahre, HGB/AO 10 Jahre, DSGVO-Löschfristen), revisionssichere Ablage mit Unveränderbarkeit (WORM/Object Lock); Audit-Logs einbeziehen.",
		domain: "compliance",
		evidenceHints: ["Aufbewahrungs-/Löschkonzept"],
		auditQuestions: [
			"Welche Aufbewahrungsfristen gelten für deine Aufzeichnungen, und wie stellst du deren Unveränderbarkeit sicher?",
		],
		pitfalls: [
			"Aufbewahrungsfristen aus GwG und DSGVO widersprechen sich und sind im Konzept nicht aufgelöst.",
		],
		recommendations: [
			{
				level: "must",
				text: "Aufbewahrungsmatrix je Datenart mit Rechtsgrundlage und Frist; Aufzeichnungen revisionssicher und verschlüsselt ablegen.",
				source: "ISO 27002",
				ref: "5.33",
			},
		],
		tools: tools(["Revisionssicheres Archiv: d.velop", "AWS S3 Object Lock"]),
	},
	{
		code: "A.5.34",
		sectionCode: "A.5",
		title: "Datenschutz und Schutz personenbezogener Daten",
		requirementText:
			"Die Organisation ermittelt und erfüllt die Anforderungen an den Datenschutz und den Schutz personenbezogener Daten entsprechend den geltenden Gesetzen, Vorschriften und Verträgen.",
		guidance:
			"DSGVO-Managementsystem mit Verarbeitungsverzeichnis, TOMs, Auftragsverarbeitungsverträgen, DSFA und Datenschutzbeauftragtem; KYC- und Transaktionsdaten besonders betrachten.",
		domain: "compliance",
		evidenceHints: ["Datenschutzmanagement (DSGVO)"],
		auditQuestions: [
			"Wie ist das Datenschutzmanagement mit dem ISMS verknüpft, und wer ist Datenschutzbeauftragter?",
		],
		tools: tools(["DataGuard", "OneTrust Privacy", "Caralegal"]),
	},
	{
		code: "A.5.35",
		sectionCode: "A.5",
		title: "Unabhängige Überprüfung der Informationssicherheit",
		requirementText:
			"Der Ansatz der Organisation zum Management der Informationssicherheit und dessen Umsetzung werden in geplanten Abständen oder bei wesentlichen Änderungen unabhängig überprüft.",
		guidance:
			"Zertifizierungs- und Überwachungsaudits, externe Pentests und ggf. Prüfungen der Innenrevision; Ergebnisse an die Geschäftsleitung berichten.",
		domain: "compliance",
		evidenceHints: ["Externe Audits"],
		auditQuestions: [
			"Wer hat dein ISMS zuletzt unabhängig überprüft, und welche Feststellungen gab es?",
		],
		relatedRequirements: ["dora:Art.6(6)", "nis2:Art.21(2)(f)", "nis2:Art.24"],
		tools: tools(["Zertifizierer (TÜV SÜD, DEKRA, DQS)"]),
	},
	{
		code: "A.5.36",
		sectionCode: "A.5",
		title: "Einhaltung von Richtlinien, Vorschriften und Normen",
		requirementText:
			"Die Einhaltung der Informationssicherheitspolitik, der Themenrichtlinien, Vorschriften und Normen wird regelmäßig überprüft.",
		guidance:
			"Compliance-Checks je Richtlinie (Stichproben, technische Prüfungen, Kontrolltests) mit dokumentiertem Ergebnis; Abweichungen in den Findings-Prozess (10.2).",
		domain: "compliance",
		evidenceHints: ["Compliance-Checks"],
		auditQuestions: [
			"Wie prüfen Führungskräfte und ISB, ob die Richtlinien in ihren Bereichen eingehalten werden?",
		],
		pitfalls: [
			"Richtlinien werden geschrieben, aber ihre Einhaltung wird nie überprüft.",
		],
		relatedRequirements: ["nis2:Art.21(2)(f)"],
		tools: tools(["GRC-Tool"]),
	},
	{
		code: "A.5.37",
		sectionCode: "A.5",
		title: "Dokumentierte Betriebsabläufe",
		requirementText:
			"Betriebsabläufe für informationsverarbeitende Einrichtungen werden dokumentiert und den Personen zur Verfügung gestellt, die sie benötigen.",
		guidance:
			"Runbooks für Betrieb, Backup, Deployment, Schlüsselzeremonien und Vorfallreaktion; versioniert in Git oder Wiki, mit Owner und Review-Datum.",
		domain: "operations",
		evidenceHints: ["Betriebshandbücher"],
		auditQuestions: [
			"Welche Betriebsabläufe sind dokumentiert, und könnte eine Vertretung damit den Betrieb übernehmen?",
		],
		pitfalls: [
			"Wissen steckt in den Köpfen einzelner Administratoren; Runbooks sind veraltet.",
		],
		tools: tools(["Confluence", "Runbooks in Git"]),
	},
];

const ANNEX_A6: Draft[] = [
	{
		code: "A.6.1",
		sectionCode: "A.6",
		title: "Sicherheitsüberprüfung",
		requirementText:
			"Vor dem Eintritt und fortlaufend werden Hintergrundüberprüfungen aller Kandidaten durchgeführt, angemessen zu Gesetzen, Ethik, Geschäftsanforderungen, Klassifizierung der Informationen und wahrgenommenen Risiken.",
		guidance:
			"Abgestuftes Screening: Identität und Zeugnisse für alle, Führungszeugnis und Bonitätsauskunft für Schlüsselpersonal (Zahlungsfreigabe, Schlüsselverwaltung, Geschäftsleitung); Zuverlässigkeitsanforderungen aus ZAG/MiCAR für Geschäftsleiter beachten, arbeitsrechtliche Grenzen und Datenschutz einhalten.",
		domain: "hr",
		evidenceHints: [
			"Screening-Prozess",
			"Führungszeugnis",
			"Bonitätsauskunft für Schlüsselpersonal",
		],
		auditQuestions: [
			"Welche Überprüfungen führst du vor der Einstellung durch, und für welche Rollen gelten erweiterte Prüfungen?",
		],
		pitfalls: [
			"Screening nur bei Festangestellten, nicht bei Freelancern und Dienstleister-Personal mit Admin-Rechten.",
		],
		relatedRequirements: ["nis2:Art.21(2)(i)"],
		tools: tools(["HireRight", "Sterling", "SCHUFA-Auskunft"]),
	},
	{
		code: "A.6.2",
		sectionCode: "A.6",
		title: "Beschäftigungs- und Vertragsbedingungen",
		requirementText:
			"Arbeitsverträge legen die Verantwortlichkeiten des Personals und der Organisation für Informationssicherheit fest.",
		guidance:
			"Vertragsklauseln zu Vertraulichkeit (auch nach Austritt), Einhaltung der Richtlinien, Umgang mit Geräten und Daten sowie Folgen von Verstößen; Standardklausel in alle Vertragsvorlagen.",
		domain: "hr",
		evidenceHints: ["Vertragsklauseln Vertraulichkeit"],
		auditQuestions: [
			"Enthalten alle Arbeits- und Dienstleisterverträge Vertraulichkeits- und Sicherheitspflichten?",
		],
		relatedRequirements: ["nis2:Art.21(2)(i)"],
	},
	{
		code: "A.6.3",
		sectionCode: "A.6",
		title: "Informationssicherheitsbewusstsein, -ausbildung und -schulung",
		requirementText:
			"Personal und relevante interessierte Parteien erhalten angemessene Sensibilisierung, Ausbildung und Schulung zur Informationssicherheit sowie regelmäßige Aktualisierungen zu Politik, Richtlinien und Verfahren, soweit für ihre Funktion relevant.",
		guidance:
			"Schulungsplan mit Pflichtmodulen (Onboarding, jährlich) und rollenspezifischen Inhalten (Entwickler: Secure Coding; Admins: Härtung; Geschäftsleitung: IKT-Risiko nach DORA Art. 5); Phishing-Simulationen quartalsweise.",
		domain: "hr",
		evidenceHints: ["Schulungsplan", "Teilnahmenachweise"],
		auditQuestions: [
			"Welche Schulungen sind für welche Rollen vorgesehen, und wie hoch ist die Teilnahmequote?",
		],
		pitfalls: [
			"Einmalige Onboarding-Schulung ohne Auffrischung; die Geschäftsleitung nimmt nicht teil.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jährliche Pflichtschulung für alle inklusive Geschäftsleitung mit Nachweis; rollenspezifische Module für Entwickler und Administratoren.",
				source: "ISO 27002",
				ref: "6.3",
			},
			{
				level: "should",
				text: "Phishing-Simulationen mit Lernmodul statt Sanktionen; Klickraten als KPI in 9.1 führen.",
				source: "intern",
			},
		],
		relatedRequirements: [
			"dora:Art.13(6)",
			"dora:Art.5(4)",
			"nis2:Art.21(2)(g)",
		],
		tools: tools(["SoSafe", "KnowBe4", "Phishing-Simulation"]),
	},
	{
		code: "A.6.4",
		sectionCode: "A.6",
		title: "Maßregelungsprozess",
		requirementText:
			"Ein Maßregelungsprozess für Verstöße gegen die Informationssicherheitspolitik wird formalisiert und kommuniziert.",
		guidance:
			"Abgestufter Prozess (Gespräch, Abmahnung, Kündigung) in Abstimmung mit HR, Betriebsrat und Arbeitsrecht; faire Behandlung und Dokumentation.",
		domain: "hr",
		evidenceHints: ["Regelung"],
		auditQuestions: [
			"Welche Konsequenzen haben Verstöße gegen Sicherheitsvorgaben, und ist der Prozess kommuniziert?",
		],
	},
	{
		code: "A.6.5",
		sectionCode: "A.6",
		title:
			"Verantwortlichkeiten nach Beendigung oder Änderung der Beschäftigung",
		requirementText:
			"Informationssicherheitspflichten, die nach Beendigung oder Änderung der Beschäftigung fortbestehen, werden festgelegt, durchgesetzt und den betroffenen Personen sowie anderen Parteien kommuniziert.",
		guidance:
			"Austrittsprozess mit Hinweis auf fortbestehende Vertraulichkeit, Entzug aller Zugänge (A.5.16/A.5.18), Rückgabe (A.5.11) und Übergabe von Verantwortlichkeiten; bei Rollenwechsel Rechte neu bewerten.",
		domain: "hr",
		evidenceHints: ["Austrittsprozess"],
		auditQuestions: [
			"Wie stellst du beim Austritt sicher, dass Pflichten kommuniziert und Zugänge entzogen werden?",
		],
		pitfalls: [
			"Rollenwechsel (Mover) werden nicht als Anlass zur Rechteprüfung behandelt; Rechte häufen sich an.",
		],
		tools: tools(["Personio + Entra ID"]),
	},
	{
		code: "A.6.6",
		sectionCode: "A.6",
		title: "Vertraulichkeits- oder Geheimhaltungsvereinbarungen",
		requirementText:
			"Vertraulichkeits- oder Geheimhaltungsvereinbarungen, die den Schutzbedarf der Organisation widerspiegeln, werden festgelegt, dokumentiert, regelmäßig überprüft und von Personal und anderen relevanten Parteien unterzeichnet.",
		guidance:
			"NDA-Vorlage für Bewerber, Dienstleister, Auditoren und Partner; elektronische Signatur mit Nachweis; Gültigkeitsdauer und Rückgabepflichten regeln.",
		domain: "hr",
		evidenceHints: ["NDAs"],
		auditQuestions: [
			"Mit wem bestehen Vertraulichkeitsvereinbarungen, und wie werden sie nachgehalten?",
		],
		tools: tools(["DocuSign", "Skribble (QES)"]),
	},
	{
		code: "A.6.7",
		sectionCode: "A.6",
		title: "Telearbeit",
		requirementText:
			"Sicherheitsmaßnahmen werden umgesetzt, wenn Personal aus der Ferne arbeitet, um Informationen zu schützen, auf die außerhalb der Räumlichkeiten der Organisation zugegriffen wird.",
		guidance:
			"Remote-Work-Richtlinie: nur verwaltete Geräte, Zero-Trust-Zugang statt klassischem VPN, Festplattenverschlüsselung, Bildschirmsperre, Regeln für öffentliche Netze und Heimarbeitsplatz.",
		domain: "access",
		evidenceHints: ["Remote-Work-Richtlinie"],
		auditQuestions: [
			"Welche Regeln gelten für mobiles Arbeiten, und wie wird der Zugriff technisch abgesichert?",
		],
		pitfalls: ["Private Geräte mit Zugriff auf Unternehmensdaten ohne MDM."],
		relatedRequirements: ["dora:Art.9(4)(c)"],
		tools: tools(["Zero-Trust: Cloudflare Zero Trust", "Zscaler", "Tailscale"]),
	},
	{
		code: "A.6.8",
		sectionCode: "A.6",
		title: "Meldung von Informationssicherheitsereignissen",
		requirementText:
			"Die Organisation stellt einen Mechanismus bereit, über den Personal beobachtete oder vermutete Informationssicherheitsereignisse zeitnah über geeignete Kanäle melden kann.",
		guidance:
			"Ein niedrigschwelliger Kanal (Formular, Chat-Kanal, Telefon), bekannt gemacht in der Schulung; Meldungen werden bestätigt und ohne Schuldzuweisung behandelt.",
		domain: "incident",
		evidenceHints: ["Meldekanal für Mitarbeitende"],
		auditQuestions: [
			"Wie melden Mitarbeitende verdächtige Ereignisse, und wie viele Meldungen gab es im letzten Jahr?",
		],
		pitfalls: [
			"Kein Meldekanal bekannt; Phishing-Klicks werden aus Angst verschwiegen.",
		],
		relatedRequirements: ["dora:Art.17", "nis2:Art.21(2)(b)"],
		tools: tools(["Jira-Formular", "Teams-Kanal"]),
	},
];

const PHYSICAL_ACCESS_TOOLS = tools([
	"Elektronische Zutrittskontrolle: Salto, dormakaba",
	"Video: Axis",
]);

const ANNEX_A7: Draft[] = [
	{
		code: "A.7.1",
		sectionCode: "A.7",
		title: "Physische Sicherheitsperimeter",
		requirementText:
			"Sicherheitsperimeter werden festgelegt und genutzt, um Bereiche mit Informationen und anderen Werten zu schützen.",
		guidance:
			"Zonenkonzept (öffentlich, Büro, Technik-/Tresorraum) mit klar definierten Grenzen; bei reinem Cloud-Betrieb liegt der Schwerpunkt auf Büro und Räumen für Schlüsselmaterial.",
		domain: "physical",
		evidenceHints: ["Zonenkonzept"],
		auditQuestions: [
			"Welche Sicherheitszonen gibt es, und wie sind ihre Grenzen gesichert?",
		],
		tools: PHYSICAL_ACCESS_TOOLS,
	},
	{
		code: "A.7.2",
		sectionCode: "A.7",
		title: "Physischer Zutritt",
		requirementText:
			"Sicherheitsbereiche werden durch angemessene Zutrittskontrollen und Zugangspunkte geschützt.",
		guidance:
			"Elektronische Zutrittskontrolle mit personalisierten Medien, Besucherregelung mit Begleitung, Protokollierung des Zutritts zu Sicherheitsbereichen, regelmäßige Prüfung der Zutrittsrechte.",
		domain: "physical",
		evidenceHints: ["Zutrittsprotokolle"],
		auditQuestions: [
			"Wer hat Zutritt zu Sicherheitsbereichen, und wie werden Besucher behandelt?",
		],
		pitfalls: ["Zutrittskarten ausgeschiedener Mitarbeitender bleiben aktiv."],
		relatedRequirements: ["dora:Art.9(4)(c)"],
		tools: PHYSICAL_ACCESS_TOOLS,
	},
	{
		code: "A.7.3",
		sectionCode: "A.7",
		title: "Sichern von Büros, Räumen und Einrichtungen",
		requirementText:
			"Physische Sicherheit für Büros, Räume und Einrichtungen wird gestaltet und umgesetzt.",
		guidance:
			"Abschließbare Büros und Technikräume, keine Hinweise auf sensible Bereiche, Schlüsselverwaltung mit Protokoll.",
		domain: "physical",
		evidenceHints: ["Zonenkonzept"],
		auditQuestions: [
			"Wie sind Büros und Technikräume gegen unbefugten Zutritt gesichert?",
		],
		tools: PHYSICAL_ACCESS_TOOLS,
	},
	{
		code: "A.7.4",
		sectionCode: "A.7",
		title: "Physische Sicherheitsüberwachung",
		requirementText:
			"Räumlichkeiten werden kontinuierlich auf unbefugten physischen Zutritt überwacht.",
		guidance:
			"Alarmanlage, Videoüberwachung der Zugänge (Datenschutz beachten), Auswertung von Zutrittsprotokollen auf Anomalien.",
		domain: "physical",
		evidenceHints: ["Zutrittsprotokolle"],
		auditQuestions: [
			"Wie würdest du einen unbefugten Zutritt außerhalb der Geschäftszeiten bemerken?",
		],
		pitfalls: [
			"Videoüberwachung ohne Datenschutzprüfung und ohne Löschfristen.",
		],
		tools: PHYSICAL_ACCESS_TOOLS,
	},
	{
		code: "A.7.5",
		sectionCode: "A.7",
		title: "Schutz vor physischen und umweltbedingten Bedrohungen",
		requirementText:
			"Schutz vor physischen und umweltbedingten Bedrohungen wie Naturkatastrophen und anderen absichtlichen oder unabsichtlichen physischen Bedrohungen wird gestaltet und umgesetzt.",
		guidance:
			"Standortrisikoanalyse (Hochwasser, Brand, Stromausfall); Rechenzentrumsleistungen von zertifizierten Anbietern (ISO 27001, EN 50600) beziehen und Testate prüfen.",
		domain: "physical",
		evidenceHints: ["Risikoanalyse Standort"],
		auditQuestions: [
			"Welche physischen Bedrohungen hast du für deine Standorte und Rechenzentren bewertet?",
		],
		tools: tools([
			"Rechenzentrum mit ISO 27001/EN 50600 (Equinix FR, Digital Realty, Telekom)",
		]),
	},
	{
		code: "A.7.6",
		sectionCode: "A.7",
		title: "Arbeiten in Sicherheitsbereichen",
		requirementText:
			"Sicherheitsmaßnahmen für das Arbeiten in Sicherheitsbereichen werden gestaltet und umgesetzt.",
		guidance:
			"Regeln für Tresor-/Key-Raum: Vier-Augen-Prinzip, keine privaten Geräte, Protokollierung, Begleitung von Dienstleistern.",
		domain: "physical",
		evidenceHints: ["Regeln Tresor-/Key-Raum"],
		auditQuestions: [
			"Welche Regeln gelten für Arbeiten in Sicherheitsbereichen wie dem Schlüsselraum?",
		],
	},
	{
		code: "A.7.7",
		sectionCode: "A.7",
		title: "Aufgeräumte Arbeitsumgebung und Bildschirmsperren",
		requirementText:
			"Regeln für eine aufgeräumte Arbeitsumgebung (Papier und Wechseldatenträger) und für Bildschirmsperren an informationsverarbeitenden Einrichtungen werden festgelegt und durchgesetzt.",
		guidance:
			"Clean-Desk-Richtlinie, automatische Bildschirmsperre nach wenigen Minuten per MDM, abschließbare Schränke, Aktenvernichter; stichprobenartige Kontrollen.",
		domain: "physical",
		evidenceHints: ["Clean-Desk-Richtlinie"],
		auditQuestions: [
			"Ist die Bildschirmsperre technisch erzwungen, und wie prüfst du die Clean-Desk-Regel?",
		],
	},
	{
		code: "A.7.8",
		sectionCode: "A.7",
		title: "Platzierung und Schutz von Geräten",
		requirementText:
			"Geräte und Betriebsmittel werden sicher platziert und geschützt.",
		guidance:
			"Aufstellungsplan für Server, Netzkomponenten und Hardware-Wallets/HSM; Schutz vor Blickeinsicht, Diebstahl, Wasser und Hitze.",
		domain: "physical",
		evidenceHints: ["Aufstellungsplan"],
		auditQuestions: [
			"Wo stehen deine kritischen Geräte, und wie sind sie vor Umwelteinflüssen und Zugriff geschützt?",
		],
	},
	{
		code: "A.7.9",
		sectionCode: "A.7",
		title: "Sicherheit von Werten außerhalb der Räumlichkeiten",
		requirementText:
			"Werte, die sich außerhalb der Räumlichkeiten der Organisation befinden, werden geschützt.",
		guidance:
			"Richtlinie für mobile Geräte: Verschlüsselung, MDM mit Remote-Wipe, keine unbeaufsichtigten Geräte, Regeln für Reisen und Grenzübertritte.",
		domain: "physical",
		evidenceHints: ["Richtlinie mobile Geräte"],
		auditQuestions: [
			"Wie sind Laptops und Smartphones außerhalb des Büros geschützt, und was passiert bei Verlust?",
		],
		pitfalls: [
			"Verlorene Geräte werden nicht als Sicherheitsereignis gemeldet und nicht gelöscht.",
		],
		tools: tools(["Intune", "Jamf"]),
	},
	{
		code: "A.7.10",
		sectionCode: "A.7",
		title: "Speichermedien",
		requirementText:
			"Speichermedien werden über ihren gesamten Lebenszyklus (Beschaffung, Nutzung, Transport, Entsorgung) entsprechend dem Klassifizierungsschema und den Handhabungsanforderungen verwaltet.",
		guidance:
			"Medienrichtlinie: Wechseldatenträger nur verschlüsselt und freigegeben, USB-Sperre per MDM, Transport vertraulicher Medien nachvollziehbar, Entsorgung nach A.7.14.",
		domain: "physical",
		evidenceHints: ["Medienrichtlinie"],
		auditQuestions: [
			"Dürfen Mitarbeitende USB-Sticks nutzen, und wie ist das technisch geregelt?",
		],
		tools: tools(["BitLocker", "FileVault"]),
	},
	{
		code: "A.7.11",
		sectionCode: "A.7",
		title: "Versorgungseinrichtungen",
		requirementText:
			"Informationsverarbeitende Einrichtungen werden vor Stromausfällen und anderen Störungen durch den Ausfall von Versorgungseinrichtungen geschützt.",
		guidance:
			"Für eigene Technikräume USV und Klimatisierung mit Wartungsnachweis; bei Colocation oder Cloud über Testate des Anbieters nachweisen.",
		domain: "physical",
		evidenceHints: ["USV-Nachweise"],
		auditQuestions: [
			"Wie ist die Stromversorgung deiner kritischen Systeme abgesichert, und wie weist du das nach?",
		],
		tools: tools(["RZ-Testat"]),
	},
	{
		code: "A.7.12",
		sectionCode: "A.7",
		title: "Sicherheit der Verkabelung",
		requirementText:
			"Strom- und Datenkabel werden vor Abhören, Störungen und Beschädigung geschützt.",
		guidance:
			"Netzplan mit Kabelwegen, Patchfelder in abgeschlossenen Räumen, gekennzeichnete Kabel; im Rechenzentrum über das Testat des Betreibers.",
		domain: "physical",
		evidenceHints: ["Netzplan"],
		auditQuestions: [
			"Wie ist die Verkabelung in deinen Räumen vor Zugriff und Beschädigung geschützt?",
		],
		tools: tools(["RZ-Testat"]),
	},
	{
		code: "A.7.13",
		sectionCode: "A.7",
		title: "Instandhaltung von Geräten",
		requirementText:
			"Geräte und Betriebsmittel werden ordnungsgemäß instand gehalten, um Verfügbarkeit, Integrität und Vertraulichkeit der Informationen sicherzustellen.",
		guidance:
			"Wartungsplan und -protokolle, Wartung nur durch autorisiertes Personal, Datenträger vor externer Reparatur löschen oder ausbauen.",
		domain: "physical",
		evidenceHints: ["Wartungsprotokolle"],
		auditQuestions: [
			"Wie wird die Wartung kritischer Geräte geplant und dokumentiert, und wer darf sie durchführen?",
		],
	},
	{
		code: "A.7.14",
		sectionCode: "A.7",
		title: "Sichere Entsorgung oder Wiederverwendung von Geräten",
		requirementText:
			"Geräte und Betriebsmittel mit Speichermedien werden vor Entsorgung oder Wiederverwendung überprüft, damit sensible Daten und lizenzierte Software sicher entfernt oder überschrieben sind.",
		guidance:
			"Löschung nach DIN 66399 bzw. BSI-Vorgaben mit Zertifikat je Gerät; Cloud-Löschnachweise vom Anbieter; Hardware-Wallets und HSM gesondert behandeln.",
		domain: "physical",
		evidenceHints: ["Löschzertifikate"],
		auditQuestions: [
			"Wie weist du nach, dass ausgemusterte Geräte sicher gelöscht wurden?",
		],
		pitfalls: [
			"Alte Laptops werden an Mitarbeitende verkauft, ohne dokumentierte Löschung.",
		],
		tools: tools(["Blancco", "zertifizierte Entsorger (DIN 66399)"]),
	},
];

const ANNEX_A8: Draft[] = [
	{
		code: "A.8.1",
		sectionCode: "A.8",
		title: "Endgeräte der Benutzer",
		requirementText:
			"Informationen, die auf Endgeräten der Benutzer gespeichert sind, von ihnen verarbeitet werden oder über sie zugänglich sind, werden geschützt.",
		guidance:
			"MDM-Pflicht für alle Geräte mit Zugriff auf Unternehmensdaten, Härtungsbaseline (CIS), Festplattenverschlüsselung, EDR, automatische Updates, Compliance-Prüfung vor Zugriff (Conditional Access).",
		domain: "operations",
		evidenceHints: ["Härtungs-/MDM-Richtlinie"],
		auditQuestions: [
			"Welche Sicherheitsvorgaben gelten für Endgeräte, und wie wird ihre Einhaltung technisch durchgesetzt?",
		],
		pitfalls: [
			"BYOD-Geräte ohne Verwaltung greifen auf E-Mail und Kundendaten zu.",
		],
		relatedRequirements: ["dora:Art.9(2)", "nis2:Art.21(2)(g)"],
		tools: tools(["Microsoft Intune", "Jamf", "Kandji"]),
	},
	{
		code: "A.8.2",
		sectionCode: "A.8",
		title: "Privilegierte Zugangsrechte",
		requirementText:
			"Die Zuweisung und Nutzung privilegierter Zugangsrechte wird eingeschränkt und gesteuert.",
		guidance:
			"PAM-Konzept: getrennte Admin-Konten, Just-in-Time-Rechte, Sitzungsaufzeichnung für kritische Systeme, quartalsweise Rezertifizierung; Break-Glass-Konten versiegelt und überwacht.",
		domain: "access",
		evidenceHints: ["PAM-Konzept", "Rezertifizierung"],
		auditQuestions: [
			"Wer hat administrative Rechte auf Produktionssystemen, und wie werden sie vergeben, genutzt und überprüft?",
		],
		pitfalls: [
			"Entwickler arbeiten dauerhaft mit Admin-Rechten in der Produktion.",
		],
		recommendations: [
			{
				level: "must",
				text: "Privilegierte Zugriffe über dedizierte Konten mit MFA, zeitlich befristeter Rechtevergabe und Protokollierung aller Sitzungen.",
				source: "ISO 27002",
				ref: "8.2",
			},
			{
				level: "should",
				text: "Just-in-Time-Zugriff mit Genehmigungs-Workflow statt stehender Admin-Rechte.",
				source: "BSI IT-Grundschutz",
				ref: "ORP.4",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(c)", "nis2:Art.21(2)(i)"],
		tools: tools(["Teleport", "Delinea"], ["CyberArk", "BeyondTrust"]),
	},
	{
		code: "A.8.3",
		sectionCode: "A.8",
		title: "Informationszugangsbeschränkung",
		requirementText:
			"Der Zugang zu Informationen und anderen Werten wird entsprechend der festgelegten Themenrichtlinie zur Zugangssteuerung eingeschränkt.",
		guidance:
			"Berechtigungskonzept je Anwendung (Rollen, Datenfelder, Mandanten), dynamische Zugriffskontrolle für sensible Daten, Protokollierung von Zugriffen auf Kundendaten.",
		domain: "access",
		evidenceHints: ["Berechtigungskonzept"],
		auditQuestions: [
			"Wie ist der Zugriff auf Kunden- und Transaktionsdaten in deinen Anwendungen beschränkt?",
		],
		relatedRequirements: ["dora:Art.9(4)(c)"],
		tools: tools(["Entra ID", "Okta"]),
	},
	{
		code: "A.8.4",
		sectionCode: "A.8",
		title: "Zugriff auf Quellcode",
		requirementText:
			"Lese- und Schreibzugriff auf Quellcode, Entwicklungswerkzeuge und Software-Bibliotheken wird angemessen gesteuert.",
		guidance:
			"Repositories mit SSO und MFA, Branch-Protection, Pflicht-Reviews, signierte Commits, keine Secrets im Code (Secret-Scanning), Zugriff nach Rolle.",
		domain: "access",
		evidenceHints: ["Repo-Rechte"],
		auditQuestions: [
			"Wer darf Code in Produktions-Branches ändern, und wie wird das kontrolliert?",
		],
		pitfalls: ["Zugangsdaten und Schlüssel im Repository eingecheckt."],
		relatedRequirements: ["nis2:Art.21(2)(e)"],
		tools: tools(["GitHub Enterprise", "GitLab"]),
	},
	{
		code: "A.8.5",
		sectionCode: "A.8",
		title: "Sichere Authentisierung",
		requirementText:
			"Sichere Authentisierungstechnologien und -verfahren werden auf Grundlage der Zugangsbeschränkungen und der Themenrichtlinie zur Zugangssteuerung umgesetzt.",
		guidance:
			"MFA für alle Nutzer und Admins, Phishing-resistent (FIDO2/Passkeys) für privilegierte Zugänge und Zahlungsfreigaben, Conditional Access nach Gerätezustand und Standort, Schutz vor Brute Force und Credential Stuffing.",
		domain: "access",
		evidenceHints: ["MFA-Nachweis"],
		auditQuestions: [
			"Für welche Zugänge ist MFA erzwungen, und welche Verfahren sind zugelassen?",
		],
		pitfalls: [
			"MFA nur per SMS oder nur für einige Dienste; Legacy-Protokolle ohne MFA erreichbar.",
		],
		recommendations: [
			{
				level: "must",
				text: "MFA für alle Konten erzwingen; für Administratoren und Zahlungsfreigaben nur Phishing-resistente Verfahren (FIDO2).",
				source: "ISO 27002",
				ref: "8.5",
			},
			{
				level: "should",
				text: "Legacy-Authentisierung (Basic Auth, IMAP ohne MFA) technisch blockieren.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(d)", "nis2:Art.21(2)(j)"],
		tools: tools(["FIDO2/YubiKey", "Entra ID Conditional Access"]),
	},
	{
		code: "A.8.6",
		sectionCode: "A.8",
		title: "Kapazitätssteuerung",
		requirementText:
			"Die Nutzung von Ressourcen wird überwacht und an aktuelle und erwartete Kapazitätsanforderungen angepasst.",
		guidance:
			"Monitoring von CPU, Speicher, Datenbank und Transaktionsvolumen mit Schwellenwert-Alarmen; Kapazitätsplanung für Lastspitzen (z. B. Gastronomie-Stoßzeiten) und Autoscaling in der Cloud.",
		domain: "operations",
		evidenceHints: ["Kapazitätsplanung"],
		auditQuestions: [
			"Wie überwachst du Kapazitäten, und wie planst du für Wachstum und Lastspitzen?",
		],
		relatedRequirements: ["dora:Art.7"],
		tools: tools(["Datadog", "Grafana", "AWS CloudWatch"]),
	},
	{
		code: "A.8.7",
		sectionCode: "A.8",
		title: "Schutz gegen Schadsoftware",
		requirementText:
			"Schutz gegen Schadsoftware wird umgesetzt und durch angemessene Sensibilisierung der Benutzer unterstützt.",
		guidance:
			"EDR auf allen Endgeräten und Servern mit zentraler Konsole, vollständige Abdeckung als KPI, Mail- und Webfilter, Makro-Sperre, Awareness zu Phishing.",
		domain: "operations",
		evidenceHints: ["EDR-Abdeckung"],
		auditQuestions: [
			"Wie hoch ist die EDR-Abdeckung deiner Geräte, und wie reagierst du auf Alarme?",
		],
		pitfalls: [
			"Server und Linux-Systeme ohne EDR, weil nur Clients betrachtet wurden.",
		],
		relatedRequirements: ["dora:Art.10", "nis2:Art.21(2)(g)"],
		tools: tools([
			"Microsoft Defender for Endpoint",
			"CrowdStrike Falcon",
			"SentinelOne",
		]),
	},
	{
		code: "A.8.8",
		sectionCode: "A.8",
		title: "Handhabung technischer Schwachstellen",
		requirementText:
			"Informationen über technische Schwachstellen der genutzten Informationssysteme werden beschafft, die Gefährdung durch sie wird bewertet, und angemessene Maßnahmen werden ergriffen.",
		guidance:
			"Regelmäßige Schwachstellenscans (Infrastruktur, Container, Abhängigkeiten), Patch-SLAs nach Kritikalität (z. B. kritisch 72 h, hoch 14 Tage), Ausnahmen mit Risikoakzeptanz; Ergebnisse als KPI. DORA Art. 25 verlangt jährliche Schwachstellenbewertungen.",
		domain: "operations",
		evidenceHints: ["Scan-Berichte", "Patch-SLAs"],
		auditQuestions: [
			"Wie schnell schließt du kritische Schwachstellen, und wie weist du das nach?",
			"Welche Systeme sind vom Scan ausgenommen, und warum?",
		],
		pitfalls: [
			"Scans laufen, aber Findings werden nicht priorisiert und bleiben monatelang offen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Patch-SLAs je Schweregrad festlegen, Scans mindestens wöchentlich automatisieren und die Einhaltung als KPI berichten.",
				source: "ISO 27002",
				ref: "8.8",
			},
			{
				level: "should",
				text: "Abhängigkeits- und Container-Scans in die CI/CD-Pipeline integrieren.",
				source: "intern",
			},
		],
		relatedRequirements: [
			"dora:Art.9(4)(f)",
			"dora:Art.25",
			"nis2:Art.21(2)(e)",
		],
		tools: tools([
			"Greenbone (DE)",
			"Tenable",
			"Qualys",
			"Rapid7",
			"Container: Snyk, Trivy",
		]),
	},
	{
		code: "A.8.9",
		sectionCode: "A.8",
		title: "Konfigurationsmanagement",
		requirementText:
			"Konfigurationen einschließlich Sicherheitskonfigurationen von Hardware, Software, Diensten und Netzen werden festgelegt, dokumentiert, umgesetzt, überwacht und überprüft.",
		guidance:
			"Härtungsbaselines (CIS Benchmarks) je Plattform, Infrastructure as Code mit Review, Drift-Erkennung über CSPM; Abweichungen als Findings behandeln.",
		domain: "operations",
		evidenceHints: ["Baselines (CIS)"],
		auditQuestions: [
			"Welche Härtungsbaselines gelten, und wie erkennst du Abweichungen?",
		],
		pitfalls: [
			"Cloud-Ressourcen per Konsole angelegt; Konfigurationen weichen unbemerkt von der Baseline ab.",
		],
		recommendations: [
			{
				level: "must",
				text: "Infrastruktur als Code verwalten und Konfigurationen automatisiert gegen Baselines prüfen (CSPM).",
				source: "ISO 27002",
				ref: "8.9",
			},
		],
		relatedRequirements: ["dora:Art.9(2)", "nis2:Art.21(2)(e)"],
		tools: tools(["Terraform", "Ansible", "Wiz", "Defender for Cloud"]),
	},
	{
		code: "A.8.10",
		sectionCode: "A.8",
		title: "Löschung von Informationen",
		requirementText:
			"Informationen, die in Informationssystemen, Geräten oder anderen Speichermedien gespeichert sind, werden gelöscht, wenn sie nicht mehr benötigt werden.",
		guidance:
			"Löschkonzept nach DIN 66398 mit Fristen je Datenart, automatisierte Lifecycle-Regeln in Cloud-Speichern, Löschnachweise; Konflikt mit Aufbewahrungspflichten (GwG) auflösen.",
		domain: "asset",
		evidenceHints: ["Löschkonzept (DIN 66398)"],
		auditQuestions: [
			"Nach welchen Regeln löschst du Daten, und wie weist du die Löschung nach?",
		],
		pitfalls: ["Backups und Logs werden bei der Löschung vergessen."],
		tools: tools(["Blancco", "Cloud-Lifecycle-Policies"]),
	},
	{
		code: "A.8.11",
		sectionCode: "A.8",
		title: "Datenmaskierung",
		requirementText:
			"Datenmaskierung wird entsprechend der Themenrichtlinie zur Zugangssteuerung, den Geschäftsanforderungen und den gesetzlichen Vorgaben eingesetzt.",
		guidance:
			"Pseudonymisierung oder Maskierung von Kunden- und Transaktionsdaten in Test, Analyse und Support; Anzeige nur der nötigen Felder (z. B. letzte vier Stellen).",
		domain: "asset",
		evidenceHints: ["Maskierungsregeln"],
		auditQuestions: [
			"Wo werden personenbezogene oder Transaktionsdaten maskiert oder pseudonymisiert?",
		],
		tools: tools(["Tonic.ai", "Delphix"]),
	},
	{
		code: "A.8.12",
		sectionCode: "A.8",
		title: "Verhinderung von Datenlecks",
		requirementText:
			"Maßnahmen zur Verhinderung von Datenlecks werden auf Systeme, Netze und Geräte angewendet, die sensible Informationen verarbeiten, speichern oder übertragen.",
		guidance:
			"DLP-Regeln für E-Mail, Cloud-Speicher und Endgeräte (Kundendaten, Schlüsselmaterial, IBAN-Muster), Upload-Kontrolle für externe Dienste; zum Start Alarmierung statt stiller Blockade.",
		domain: "asset",
		evidenceHints: ["DLP-Regeln"],
		auditQuestions: [
			"Wie verhinderst oder erkennst du den Abfluss vertraulicher Daten per E-Mail, Cloud oder USB?",
		],
		pitfalls: [
			"DLP nur im Monitoring-Modus eingeführt und nie scharf geschaltet.",
		],
		tools: tools(["Microsoft Purview DLP", "Netskope"]),
	},
	{
		code: "A.8.13",
		sectionCode: "A.8",
		title: "Sicherung von Informationen",
		requirementText:
			"Sicherungskopien von Informationen, Software und Systemen werden gemäß der Themenrichtlinie zur Datensicherung erstellt, aufbewahrt und regelmäßig getestet.",
		guidance:
			"Backup-Konzept nach 3-2-1-Regel, unveränderliche Kopien gegen Ransomware, getrennte Zugangsdaten, verschlüsselt; Restore-Tests mindestens quartalsweise mit Protokoll; Wallet-Seeds und Schlüssel gesondert sichern.",
		domain: "continuity",
		evidenceHints: ["Backup-Konzept", "Restore-Tests"],
		auditQuestions: [
			"Wann hast du zuletzt eine Wiederherstellung aus dem Backup getestet, und wie lange dauerte sie?",
		],
		pitfalls: [
			"Backups liegen im selben Cloud-Account mit denselben Admin-Rechten wie die Produktion.",
		],
		recommendations: [
			{
				level: "must",
				text: "Unveränderliche, logisch getrennte Backups mit regelmäßig dokumentierten Restore-Tests; RPO/RTO aus der BIA ableiten.",
				source: "ISO 27002",
				ref: "8.13",
			},
			{
				level: "should",
				text: "Mindestens eine Kopie außerhalb des Primär-Cloud-Accounts (anderer Account oder Anbieter).",
				source: "BSI IT-Grundschutz",
				ref: "CON.3",
			},
		],
		relatedRequirements: ["dora:Art.12(1)", "nis2:Art.21(2)(c)"],
		tools: tools(["Veeam", "Rubrik", "S3 Object Lock (immutable)"]),
	},
	{
		code: "A.8.14",
		sectionCode: "A.8",
		title: "Redundanz informationsverarbeitender Einrichtungen",
		requirementText:
			"Informationsverarbeitende Einrichtungen werden mit ausreichender Redundanz umgesetzt, um Verfügbarkeitsanforderungen zu erfüllen.",
		guidance:
			"Hochverfügbarkeitskonzept: Multi-AZ für kritische Dienste, Datenbank-Replikation, redundante Netzanbindung; Failover regelmäßig testen und Ergebnisse in A.5.30 einfließen lassen.",
		domain: "continuity",
		evidenceHints: ["Hochverfügbarkeitskonzept"],
		auditQuestions: [
			"Welche Komponenten sind redundant ausgelegt, und wann wurde ein Failover zuletzt getestet?",
		],
		relatedRequirements: ["dora:Art.12(2)", "dora:Art.7", "nis2:Art.21(2)(c)"],
		tools: tools(["Multi-AZ/Multi-Region in AWS/Azure"]),
	},
	{
		code: "A.8.15",
		sectionCode: "A.8",
		title: "Protokollierung",
		requirementText:
			"Protokolle über Aktivitäten, Ausnahmen, Fehler und andere relevante Ereignisse werden erzeugt, gespeichert, geschützt und analysiert.",
		guidance:
			"Logging-Konzept: Quellen, Ereignisse (Authentisierung, Admin-Aktionen, Zahlungsfreigaben, Schlüsselnutzung), Aufbewahrung (z. B. 12 Monate online), Schutz vor Manipulation (zentral, schreibgeschützt), Zeitsynchronisation.",
		domain: "operations",
		evidenceHints: ["Logging-Konzept"],
		auditQuestions: [
			"Welche Ereignisse protokollierst du, wie lange, und wie sind Protokolle vor Veränderung geschützt?",
		],
		pitfalls: [
			"Logs liegen nur lokal auf den Systemen und gehen bei einer Kompromittierung mit verloren.",
		],
		recommendations: [
			{
				level: "must",
				text: "Zentrale, manipulationsgeschützte Protokollierung aller sicherheitsrelevanten Ereignisse mit festgelegter Aufbewahrung.",
				source: "ISO 27002",
				ref: "8.15",
			},
			{
				level: "should",
				text: "Personenbezogene Daten in Protokollen minimieren und Zugriffe auf die Logs selbst protokollieren.",
				source: "BSI IT-Grundschutz",
				ref: "OPS.1.1.5",
			},
		],
		relatedRequirements: ["dora:Art.9(1)", "dora:Art.10"],
		tools: tools([
			"Microsoft Sentinel",
			"Splunk",
			"Elastic Security",
			"Wazuh (Open Source)",
		]),
	},
	{
		code: "A.8.16",
		sectionCode: "A.8",
		title: "Überwachung von Aktivitäten",
		requirementText:
			"Netze, Systeme und Anwendungen werden auf anomales Verhalten überwacht, und es werden geeignete Maßnahmen zur Bewertung möglicher Informationssicherheitsvorfälle ergriffen.",
		guidance:
			"SIEM mit Use Cases für die eigenen Risiken (Kontoübernahme, ungewöhnliche Transaktionsmuster, Admin-Anomalien) und Alarmierung mit Reaktionszeiten; kleine Teams nutzen einen MDR-Dienst für 24/7.",
		domain: "operations",
		evidenceHints: ["SOC-Nachweise"],
		auditQuestions: [
			"Wer überwacht deine Systeme außerhalb der Geschäftszeiten, und wie schnell wird auf Alarme reagiert?",
		],
		pitfalls: ["SIEM eingeführt, aber niemand bearbeitet die Alarme."],
		recommendations: [
			{
				level: "must",
				text: "Erkennungs-Use-Cases aus der Risikobeurteilung ableiten und 24/7-Reaktion sicherstellen, intern oder über MDR.",
				source: "ISO 27002",
				ref: "8.16",
			},
		],
		relatedRequirements: ["dora:Art.10", "dora:Art.9(1)"],
		tools: tools([
			"MDR-Dienst: Arctic Wolf",
			"CrowdStrike Falcon Complete",
			"Telekom MDR",
		]),
	},
	{
		code: "A.8.17",
		sectionCode: "A.8",
		title: "Uhrensynchronisation",
		requirementText:
			"Die Uhren der von der Organisation genutzten Informationssysteme werden mit zugelassenen Zeitquellen synchronisiert.",
		guidance:
			"NTP gegen vertrauenswürdige Quellen (PTB, Cloud Time Sync), einheitliche Zeitbasis (UTC) in Logs; wichtig für forensische Auswertbarkeit und Meldefristen.",
		domain: "operations",
		evidenceHints: ["NTP-Konfiguration"],
		auditQuestions: [
			"Gegen welche Zeitquelle synchronisieren deine Systeme, und wie wird das überwacht?",
		],
		tools: tools(["PTB-NTP", "AWS Time Sync"]),
	},
	{
		code: "A.8.18",
		sectionCode: "A.8",
		title: "Hilfsprogramme mit privilegierten Rechten",
		requirementText:
			"Der Gebrauch von Hilfsprogrammen, die System- und Anwendungskontrollen umgehen können, wird eingeschränkt und streng gesteuert.",
		guidance:
			"Freigabeliste für Admin-Werkzeuge, Nutzung nur über PAM mit Protokollierung, Entfernen nicht benötigter Werkzeuge von Produktionssystemen.",
		domain: "operations",
		evidenceHints: ["Freigabeliste"],
		auditQuestions: [
			"Welche privilegierten Werkzeuge sind zugelassen, und wie wird ihre Nutzung protokolliert?",
		],
		tools: tools(["PAM-Tool"]),
	},
	{
		code: "A.8.19",
		sectionCode: "A.8",
		title: "Installation von Software auf Systemen im Betrieb",
		requirementText:
			"Verfahren und Maßnahmen zur sicheren Verwaltung der Installation von Software auf Systemen im Betrieb werden umgesetzt.",
		guidance:
			"Application Whitelisting oder zumindest Entzug lokaler Admin-Rechte auf Endgeräten, genehmigter Softwarekatalog, Installationen auf Servern nur über Change-Prozess und Pipeline.",
		domain: "operations",
		evidenceHints: ["Whitelisting"],
		auditQuestions: [
			"Können Nutzer selbst Software installieren, und wie werden Installationen auf Servern gesteuert?",
		],
		pitfalls: ["Lokale Admin-Rechte für alle, weil es bequemer ist."],
		relatedRequirements: ["dora:Art.9(4)(f)"],
		tools: tools(["Intune", "ThreatLocker"]),
	},
	{
		code: "A.8.20",
		sectionCode: "A.8",
		title: "Netzwerksicherheit",
		requirementText:
			"Netze und Netzgeräte werden gesichert, verwaltet und gesteuert, um die Informationen in Systemen und Anwendungen zu schützen.",
		guidance:
			"Netzsicherheitskonzept mit Firewall-Regeln nach Default-Deny, dokumentierten Freigaben, Schutz der Management-Zugänge, Logging der Netzgeräte; in der Cloud Security Groups und NACLs als Code.",
		domain: "network",
		evidenceHints: ["Netzsicherheitskonzept"],
		auditQuestions: [
			"Wie sind deine Netzgrenzen gesichert, und wer darf Firewall-Regeln ändern?",
		],
		pitfalls: [
			"Firewall-Regeln wachsen ungeprüft an; niemand weiß, welche noch nötig sind.",
		],
		recommendations: [
			{
				level: "must",
				text: "Default-Deny an allen Netzgrenzen, Regeländerungen über den Change-Prozess und jährliches Regel-Review.",
				source: "ISO 27002",
				ref: "8.20",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(b)"],
		tools: tools(["Palo Alto", "Fortinet", "Cloud: AWS Security Groups"]),
	},
	{
		code: "A.8.21",
		sectionCode: "A.8",
		title: "Sicherheit von Netzwerkdiensten",
		requirementText:
			"Sicherheitsmechanismen, Service-Level und Anforderungen an Netzwerkdienste werden identifiziert, umgesetzt und überwacht.",
		guidance:
			"SLA-Nachweise und Sicherheitsmerkmale der Netzdienstleister (ISP, CDN, DDoS-Schutz) dokumentieren; DDoS-Schutz für kundenseitige Endpunkte ist für Zahlungsdienste Pflichtprogramm.",
		domain: "network",
		evidenceHints: ["SLA-Nachweise"],
		auditQuestions: [
			"Welche Netzdienste beziehst du extern, und wie überwachst du deren Sicherheit und Verfügbarkeit?",
		],
		relatedRequirements: ["dora:Art.9(4)(b)"],
		tools: tools(["Cloudflare", "Akamai"]),
	},
	{
		code: "A.8.22",
		sectionCode: "A.8",
		title: "Trennung von Netzwerken",
		requirementText:
			"Gruppen von Informationsdiensten, Benutzern und Informationssystemen werden in den Netzen der Organisation voneinander getrennt.",
		guidance:
			"Segmentierungsplan: Produktion, Entwicklung, Büro, Gäste und Management getrennt; Zero-Trust-Zugriff auf Produktionssysteme; Mikrosegmentierung für Schlüssel- und Signaturdienste.",
		domain: "network",
		evidenceHints: ["Segmentierungsplan"],
		auditQuestions: [
			"Wie sind Produktions-, Entwicklungs- und Büronetze voneinander getrennt?",
		],
		pitfalls: [
			"Flaches Netz; ein kompromittierter Büro-Laptop erreicht Produktionsdatenbanken.",
		],
		recommendations: [
			{
				level: "must",
				text: "Produktion von Büro- und Entwicklungsumgebung trennen und Übergänge auf authentisierte, protokollierte Zugänge beschränken.",
				source: "ISO 27002",
				ref: "8.22",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(b)"],
		tools: tools(["VPC-Design", "Illumio"]),
	},
	{
		code: "A.8.23",
		sectionCode: "A.8",
		title: "Webfilterung",
		requirementText:
			"Der Zugriff auf externe Websites wird gesteuert, um die Gefährdung durch schädliche Inhalte zu verringern.",
		guidance:
			"DNS- und Web-Filter auf verwalteten Geräten mit Blockierung bekannter Schadkategorien, Protokollierung, Ausnahmen über Ticket.",
		domain: "network",
		evidenceHints: ["Filterregeln"],
		auditQuestions: [
			"Wie schützt du Mitarbeitende vor schädlichen Websites, auch außerhalb des Büronetzes?",
		],
		tools: tools(["Cloudflare Gateway", "Zscaler"]),
	},
	{
		code: "A.8.24",
		sectionCode: "A.8",
		title: "Verwendung von Kryptographie",
		requirementText:
			"Regeln für den wirksamen Einsatz von Kryptographie einschließlich der Verwaltung kryptographischer Schlüssel werden festgelegt und umgesetzt.",
		guidance:
			"Kryptokonzept: zugelassene Algorithmen und Protokolle (BSI TR-02102), Verschlüsselung at rest und in transit, Schlüssellebenszyklus (Erzeugung, Speicherung, Rotation, Vernichtung), HSM/KMS für Produktions- und Wallet-Schlüssel, Vier-Augen bei Zeremonien. Für einen CASP ist Schlüsselverwahrung Kerngeschäft.",
		domain: "crypto",
		evidenceHints: ["Kryptokonzept", "Schlüsselmanagement"],
		auditQuestions: [
			"Welche Algorithmen und Schlüssellängen sind zugelassen, und wie werden Schlüssel erzeugt, gespeichert und rotiert?",
			"Wer hat Zugriff auf Produktions- und Wallet-Schlüssel?",
		],
		pitfalls: [
			"Schlüssel in Umgebungsvariablen oder Konfigurationsdateien statt im KMS/HSM; keine Rotation.",
		],
		recommendations: [
			{
				level: "must",
				text: "Kryptokonzept nach BSI TR-02102 mit vollständigem Schlüssellebenszyklus; Schlüssel ausschließlich in KMS/HSM, Zugriff protokolliert und im Vier-Augen-Prinzip.",
				source: "BSI IT-Grundschutz",
				ref: "CON.1 / TR-02102",
			},
			{
				level: "should",
				text: "Krypto-Agilität vorsehen (Algorithmen austauschbar) und die Post-Quanten-Migration beobachten.",
				source: "ENISA",
			},
		],
		relatedRequirements: [
			"dora:Art.9(2)",
			"dora:Art.9(4)(d)",
			"nis2:Art.21(2)(h)",
		],
		tools: tools([
			"HSM: Utimaco (DE), Thales Luna, AWS CloudHSM",
			"KMS: HashiCorp Vault, AWS KMS",
		]),
	},
	{
		code: "A.8.25",
		sectionCode: "A.8",
		title: "Sicherer Entwicklungslebenszyklus",
		requirementText:
			"Regeln für die sichere Entwicklung von Software und Systemen werden festgelegt und angewendet.",
		guidance:
			"SDLC-Richtlinie: Sicherheitsanforderungen, Threat Modeling, Secure Coding, Code-Review, SAST/DAST/SCA in der Pipeline, Abnahmekriterien, getrennte Umgebungen; für Smart Contracts externe Audits vor dem Deployment.",
		domain: "development",
		evidenceHints: ["SDLC-Richtlinie"],
		auditQuestions: [
			"Welche Sicherheitsschritte sind in deinem Entwicklungsprozess verbindlich, und wie wird deren Durchführung nachgewiesen?",
		],
		pitfalls: [
			"Sicherheitstests sind optional und werden unter Zeitdruck übersprungen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Sicherheits-Gates in der CI/CD-Pipeline (SAST, SCA, Secret-Scanning, Pflicht-Review) technisch erzwingen, nicht nur als Richtlinie.",
				source: "ISO 27002",
				ref: "8.25",
			},
		],
		relatedRequirements: ["dora:Art.9(2)", "nis2:Art.21(2)(e)"],
		tools: tools(["GitHub Advanced Security", "GitLab Ultimate"]),
	},
	{
		code: "A.8.26",
		sectionCode: "A.8",
		title: "Anforderungen an die Anwendungssicherheit",
		requirementText:
			"Anforderungen an die Informationssicherheit werden bei der Entwicklung oder Beschaffung von Anwendungen ermittelt, spezifiziert und genehmigt.",
		guidance:
			"OWASP ASVS als Anforderungskatalog (Level 2 für Zahlungsanwendungen), zusätzlich PSD2-SCA, Transaktionssignierung und Logging-Anforderungen; Anforderungen in User Stories und Tickets verankern.",
		domain: "development",
		evidenceHints: ["Anforderungskatalog"],
		auditQuestions: [
			"Wo sind die Sicherheitsanforderungen an deine Anwendungen festgelegt, und wie werden sie in der Entwicklung berücksichtigt?",
		],
		relatedRequirements: ["nis2:Art.21(2)(e)"],
		tools: tools(["OWASP ASVS"]),
	},
	{
		code: "A.8.27",
		sectionCode: "A.8",
		title: "Sichere Systemarchitektur und Entwicklungsgrundsätze",
		requirementText:
			"Grundsätze für die Entwicklung sicherer Systeme werden festgelegt, dokumentiert, gepflegt und auf alle Entwicklungstätigkeiten angewendet.",
		guidance:
			"Architekturprinzipien (Zero Trust, Least Privilege, Defense in Depth, Secure by Default, Fail Secure) dokumentieren; Threat Modeling für neue Komponenten und bei Architekturänderungen.",
		domain: "development",
		evidenceHints: ["Architekturprinzipien"],
		auditQuestions: [
			"Welche Sicherheitsprinzipien gelten für deine Architektur, und wann wurde zuletzt ein Threat Modeling durchgeführt?",
		],
		pitfalls: [
			"Threat Modeling einmal zu Projektstart, nie nach Architekturänderungen.",
		],
		relatedRequirements: ["nis2:Art.21(2)(e)"],
		tools: tools(["Threat Modeling: OWASP Threat Dragon", "IriusRisk"]),
	},
	{
		code: "A.8.28",
		sectionCode: "A.8",
		title: "Sichere Codierung",
		requirementText:
			"Grundsätze sicherer Codierung werden auf die Softwareentwicklung angewendet.",
		guidance:
			"Coding-Standards (OWASP, sprachspezifisch), SAST und Abhängigkeitsprüfung in der Pipeline, Pflicht-Review durch eine zweite Person, Schulung der Entwickler; signierte und geprüfte Drittkomponenten.",
		domain: "development",
		evidenceHints: ["Coding-Standards", "SAST"],
		auditQuestions: [
			"Welche Coding-Standards gelten, und wie wird ihre Einhaltung automatisiert geprüft?",
		],
		relatedRequirements: ["nis2:Art.21(2)(e)"],
		tools: tools(["SonarQube", "Semgrep", "Snyk Code"]),
	},
	{
		code: "A.8.29",
		sectionCode: "A.8",
		title: "Sicherheitsprüfung in Entwicklung und Abnahme",
		requirementText:
			"Sicherheitstestprozesse werden im Entwicklungslebenszyklus festgelegt und umgesetzt.",
		guidance:
			"DAST in der Pipeline, jährlicher externer Pentest der kundenseitigen Systeme plus anlassbezogen nach größeren Änderungen, Smart-Contract-Audits vor dem Deployment; Findings in den Schwachstellenprozess. DORA Art. 24–25 verlangt ein Testprogramm, TLPT nur für benannte Institute.",
		domain: "development",
		evidenceHints: ["DAST", "Pentest-Berichte"],
		auditQuestions: [
			"Wann wurde dein letzter externer Penetrationstest durchgeführt, und wie wurden die Findings behandelt?",
		],
		pitfalls: [
			"Pentest-Bericht liegt vor, kritische Findings sind nach einem Jahr noch offen.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jährlicher externer Pentest aller extern erreichbaren Systeme sowie Tests nach wesentlichen Änderungen; Findings mit Fristen nachverfolgen.",
				source: "ISO 27002",
				ref: "8.29",
			},
			{
				level: "should",
				text: "Testprogramm nach DORA Art. 24 dokumentieren (Umfang, Methoden, Frequenz, Verantwortliche) und mit den Pentests verzahnen.",
				source: "intern",
			},
		],
		relatedRequirements: ["dora:Art.24", "dora:Art.25", "nis2:Art.21(2)(e)"],
		tools: tools([
			"OWASP ZAP",
			"Burp Suite",
			"Pentester: SySS, usd, Cure53",
			"Smart Contracts: Trail of Bits, OpenZeppelin, ChainSecurity",
		]),
	},
	{
		code: "A.8.30",
		sectionCode: "A.8",
		title: "Ausgegliederte Entwicklung",
		requirementText:
			"Die Organisation leitet, überwacht und überprüft die Tätigkeiten im Zusammenhang mit ausgegliederter Systementwicklung.",
		guidance:
			"Vertragliche Vorgaben zu Secure Coding, Testnachweisen, Rechten am Code, Quellcode-Übergabe und Audit-Rechten; eigene Abnahmetests vor der Produktivsetzung.",
		domain: "development",
		evidenceHints: ["Lieferantenvorgaben"],
		auditQuestions: [
			"Welche Sicherheitsvorgaben machst du externen Entwicklern, und wie prüfst du deren Lieferungen?",
		],
		relatedRequirements: ["dora:Art.30", "nis2:Art.21(2)(d)"],
		tools: tools(["Vertragsklauseln"]),
	},
	{
		code: "A.8.31",
		sectionCode: "A.8",
		title: "Trennung von Entwicklungs-, Test- und Produktionsumgebungen",
		requirementText:
			"Entwicklungs-, Test- und Produktionsumgebungen werden voneinander getrennt und gesichert.",
		guidance:
			"Getrennte Cloud-Accounts oder Projekte je Umgebung, keine Produktionsdaten in Test ohne Maskierung, Deployment nur über Pipeline mit Freigabe, keine Entwicklerrechte auf Produktion.",
		domain: "development",
		evidenceHints: ["Dev/Test/Prod-Konzept"],
		auditQuestions: [
			"Wie sind deine Umgebungen getrennt, und wer darf in die Produktion deployen?",
		],
		pitfalls: ["Produktionsdatenbank-Dump als Testdatenbasis ohne Maskierung."],
		relatedRequirements: ["dora:Art.9(4)(e)"],
		tools: tools(["getrennte Cloud-Accounts (AWS Organizations)"]),
	},
	{
		code: "A.8.32",
		sectionCode: "A.8",
		title: "Änderungsmanagement",
		requirementText:
			"Änderungen an informationsverarbeitenden Einrichtungen und Informationssystemen unterliegen Verfahren des Änderungsmanagements.",
		guidance:
			"Change-Prozess mit Risikobewertung, Test, Freigabe (Vier-Augen), Rollback-Plan und Dokumentation; Standard-Changes über die Pipeline, Notfall-Changes nachträglich genehmigt. DORA Art. 9(4)(e) verlangt dies ausdrücklich.",
		domain: "development",
		evidenceHints: ["Change-Prozess"],
		auditQuestions: [
			"Wie werden Änderungen an Produktionssystemen bewertet, getestet, freigegeben und dokumentiert?",
		],
		pitfalls: [
			"Notfall-Changes werden nie nachträglich dokumentiert und bewertet.",
		],
		recommendations: [
			{
				level: "must",
				text: "Jeder Produktions-Change ist nachvollziehbar: Ticket, Test, Freigabe durch eine zweite Person, Rollback-Plan; die Pipeline erzwingt den Prozess.",
				source: "ISO 27002",
				ref: "8.32",
			},
		],
		relatedRequirements: ["dora:Art.9(4)(e)", "dora:Art.8(5-7)"],
		tools: tools(["Jira Service Management", "ServiceNow"]),
	},
	{
		code: "A.8.33",
		sectionCode: "A.8",
		title: "Testinformationen",
		requirementText:
			"Testinformationen werden angemessen ausgewählt, geschützt und verwaltet.",
		guidance:
			"Synthetische oder maskierte Testdaten, keine echten Kundendaten in Test; Zugriff auf Testumgebungen ebenfalls gesteuert, Löschung nach Testende.",
		domain: "development",
		evidenceHints: ["Testdatenrichtlinie"],
		auditQuestions: [
			"Woher stammen deine Testdaten, und wie stellst du sicher, dass keine echten Kundendaten verwendet werden?",
		],
		tools: tools(["Tonic.ai"]),
	},
	{
		code: "A.8.34",
		sectionCode: "A.8",
		title: "Schutz der Informationssysteme während der Auditprüfung",
		requirementText:
			"Audittests und andere Prüfungstätigkeiten an Produktionssystemen werden zwischen Prüfer und Leitung geplant und abgestimmt, um Betriebsstörungen zu vermeiden.",
		guidance:
			"Audit-Zugriffsregeln: Lesezugriff statt Vollzugriff, Zeitfenster, Protokollierung, Freigabe von Scans und Pentests auf Produktion; gilt auch für Aufsichtsprüfungen und Dienstleister-Audits.",
		domain: "compliance",
		evidenceHints: ["Audit-Zugriffsregeln"],
		auditQuestions: [
			"Wie stellst du sicher, dass Audits und Tests den Produktionsbetrieb nicht gefährden?",
		],
		relatedRequirements: ["dora:Art.24"],
	},
];

export const ISO27001_REQUIREMENTS: CatalogRequirement[] = [
	...CLAUSES,
	...ANNEX_A5,
	...ANNEX_A6,
	...ANNEX_A7,
	...ANNEX_A8,
].map((r, i) => ({ ...r, sortOrder: (i + 1) * 10 }));
