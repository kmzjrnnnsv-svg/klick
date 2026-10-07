import type { CatalogRequirement, CatalogSection } from "./types";

// ZAG-MaRisk – BaFin-Rundschreiben 07/2024 (§ 27 ZAG). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 4 (Tabellen 4.1–4.3).
// Gilt ab Lizenzstufe 2 (Zahlungs-/E-Geld-Institut). BAIT/ZAIT als Historie.
// Paraphrasen, kein Rechtsrat.

export const ZAG_MARISK_SECTIONS: CatalogSection[] = [
	{ code: "AT", title: "Allgemeiner Teil (AT)", sortOrder: 10 },
	{ code: "BT", title: "Besonderer Teil (BTO, BTR, BT)", sortOrder: 20 },
	{ code: "ERG", title: "Ergänzende Leitlinien", sortOrder: 30 },
	{ code: "HIST", title: "Historie: BAIT / ZAIT", sortOrder: 40 },
];

const FE = ["financial_entity"] as const;
const at = (
	code: string,
	title: string,
	requirementText: string,
	domain: CatalogRequirement["domain"],
	evidenceHints: string[],
	extra: Partial<CatalogRequirement> = {},
	sortOrder = 0,
): CatalogRequirement => ({
	code,
	sectionCode: "AT",
	title,
	requirementText,
	domain,
	appliesToRoles: [...FE],
	evidenceHints,
	sortOrder,
	...extra,
});

export const ZAG_MARISK_REQUIREMENTS: CatalogRequirement[] = [
	at(
		"AT1-2",
		"Proportionalität und Anwendungsbereich",
		"Das Institut legt den Anwendungsbereich der ZAG-MaRisk fest und setzt die Anforderungen proportional zu Art, Umfang, Komplexität und Risikogehalt seiner Geschäftsaktivitäten um; die Entscheidung ist dokumentiert.",
		"governance",
		["Anwendbarkeitsanalyse"],
		{
			guidance:
				"Kurze Proportionalitätsanalyse je Modul (AT/BT) mit Begründung, warum Erleichterungen genutzt werden.",
			relatedRequirements: ["iso27001:4.3", "dora:Art.16"],
		},
		10,
	),
	at(
		"AT3",
		"Gesamtverantwortung der Geschäftsleitung",
		"Alle Geschäftsleiter:innen sind unabhängig von der internen Zuständigkeitsregelung für die ordnungsgemäße Geschäftsorganisation und deren Weiterentwicklung verantwortlich; Geschäftsverteilung und Vertretung sind festgelegt.",
		"governance",
		["Geschäftsverteilungsplan"],
		{
			relatedRequirements: ["iso27001:5.1", "dora:Art.5(2)", "nis2:Art.20(1)"],
		},
		20,
	),
	at(
		"AT4.1",
		"Risikotragfähigkeit",
		"Das Institut stellt auf Basis seines Gesamtrisikoprofils sicher, dass die wesentlichen Risiken laufend durch das Risikodeckungspotenzial (Kapital und Liquidität) abgedeckt sind, und richtet einen internen Prozess zur Sicherstellung der Risikotragfähigkeit ein.",
		"risk",
		["Risikotragfähigkeitskonzept", "Berechnung"],
		{
			guidance:
				"Konzept mit Risikodeckungspotenzial, Limiten und Kapitalplanung; jährlicher GL-Beschluss (RES-ZAG-RTF).",
			tools: {
				startup: ["Excel/Python-Modell"],
				scale: ["msg GillardonBSM", "avedos risk2value"],
			},
			relatedRequirements: ["dora:Art.6(1-4)"],
		},
		30,
	),
	at(
		"AT4.2",
		"Geschäfts- und Risikostrategie",
		"Die Geschäftsleitung legt eine nachhaltige Geschäftsstrategie und eine dazu konsistente Risikostrategie (einschließlich ESG-Risiken) fest, überprüft sie mindestens jährlich und erörtert sie mit dem Aufsichtsorgan.",
		"governance",
		["Strategiedokumente", "jährliche Überprüfung"],
		{
			relatedRequirements: ["dora:Art.6(8)", "iso27001:5.2"],
		},
		40,
	),
	at(
		"AT4.3.1",
		"Aufbau- und Ablauforganisation, Funktionstrennung",
		"Prozesse und Zuständigkeiten sind klar definiert und aufeinander abgestimmt; miteinander unvereinbare Tätigkeiten werden von verschiedenen Personen wahrgenommen; Berechtigungen folgen der Organisation.",
		"governance",
		["Organigramm", "Kompetenzordnung", "Prozesslandkarte"],
		{
			relatedRequirements: [
				"iso27001:A.5.3",
				"iso27001:A.5.2",
				"dora:Art.8(1-4)",
			],
		},
		50,
	),
	at(
		"AT4.3.2",
		"Risikosteuerungs- und -controllingprozesse",
		"Angemessene Prozesse zur Identifizierung, Beurteilung, Steuerung, Überwachung und Kommunikation der wesentlichen Risiken (Risikoinventur) sind eingerichtet und in die Planung integriert.",
		"risk",
		["Risikoinventur", "Risikohandbuch"],
		{
			tools: {
				startup: ["Klick Risiken"],
				scale: ["avedos risk2value", "HiScout GRC", "OneTrust GRC"],
			},
			relatedRequirements: [
				"iso27001:6.1.2",
				"iso27001:8.2",
				"dora:Art.6(1-4)",
			],
		},
		60,
	),
	at(
		"AT4.4.1",
		"Risikocontrolling-Funktion",
		"Eine von den geschäftsinitiierenden Bereichen unabhängige Risikocontrolling-Funktion überwacht und kommuniziert die Risiken; ihre Leitung ist benannt und berichtet an die Geschäftsleitung.",
		"governance",
		["Bestellung", "Funktionsbeschreibung"],
		{
			relatedRequirements: ["dora:Art.6(1-4)", "iso27001:5.3"],
		},
		70,
	),
	at(
		"AT4.4.2",
		"Compliance-Funktion",
		"Eine Compliance-Funktion wirkt den Risiken aus der Nichteinhaltung rechtlicher Regelungen entgegen, identifiziert wesentliche Vorgaben, berichtet mindestens jährlich an die Geschäftsleitung und darf nur bei geringer Komplexität vollständig ausgelagert werden.",
		"compliance",
		[
			"Compliance-Charta",
			"Rechtsmonitoring",
			"Compliance-Plan",
			"Jahresbericht",
		],
		{
			tools: {
				startup: ["Klick Rahmenwerke + Kalender"],
				scale: ["PwC Plus", "FIS-Rechtskataster", "Haufe"],
			},
			relatedRequirements: ["iso27001:A.5.31", "iso27001:A.5.36"],
		},
		80,
	),
	at(
		"AT4.4.3",
		"Interne Revision",
		"Eine prozessunabhängige Interne Revision prüft risikoorientiert alle Aktivitäten und Prozesse, folgt einem Prüfungsplan und berichtet an die Geschäftsleitung; Feststellungen werden nachverfolgt.",
		"governance",
		["Revisionsordnung", "Prüfungsplan", "Prüfungsberichte"],
		{
			tools: {
				startup: ["ausgelagerte Revision"],
				scale: ["Audimex", "TeamMate+"],
			},
			relatedRequirements: ["iso27001:9.2", "dora:Art.6(6)"],
		},
		90,
	),
	at(
		"AT5",
		"Organisationsrichtlinien",
		"Die Geschäftsaktivitäten sind in Organisationsrichtlinien (schriftlich fixierte Ordnung) festgelegt, den Mitarbeitenden bekannt gemacht und werden bei Änderungen zeitnah angepasst.",
		"governance",
		["Schriftlich fixierte Ordnung", "Richtlinienverzeichnis"],
		{
			relatedRequirements: [
				"iso27001:7.5",
				"iso27001:A.5.1",
				"dora:Art.6(1-4)",
			],
		},
		100,
	),
	at(
		"AT6",
		"Dokumentation",
		"Geschäfts-, Kontroll- und Überwachungsunterlagen werden systematisch, nachvollziehbar und für sachkundige Dritte prüfbar dokumentiert und grundsätzlich fünf Jahre aufbewahrt.",
		"compliance",
		["Aufbewahrungskonzept", "Archiv"],
		{
			relatedRequirements: ["iso27001:7.5", "iso27001:A.5.33"],
		},
		110,
	),
	at(
		"AT7.1",
		"Personal",
		"Quantitative und qualitative Personalausstattung entsprechen den Aufgaben; Qualifikation wird sichergestellt, Vertretungsregelungen bestehen, Anreizsysteme gefährden nicht die Risikostrategie.",
		"hr",
		["Stellenplan", "Qualifikationsnachweise", "Vertretungsregelungen"],
		{
			tools: { startup: ["Personio"], scale: ["dieselben"] },
			relatedRequirements: ["iso27001:7.1", "iso27001:7.2", "iso27001:A.6.3"],
		},
		120,
	),
	at(
		"AT7.2",
		"Technisch-organisatorische Ausstattung",
		"Umfang und Qualität der IT-Systeme und Prozesse orientieren sich an den betrieblichen Erfordernissen und gängigen Standards; für DORA-Institute gelten die IKT-Anforderungen des DORA-Rahmenwerks.",
		"operations",
		["Verweis auf DORA-Rahmenwerk"],
		{
			guidance:
				"Kein eigener Nachweis — Abdeckung über DORA Kapitel II; Mapping dokumentieren.",
			relatedRequirements: ["dora:Art.6(1-4)", "dora:Art.9(1)", "iso27001:8.1"],
		},
		130,
	),
	at(
		"AT7.3",
		"Notfallmanagement",
		"Für zeitkritische Aktivitäten und Prozesse besteht ein Notfallkonzept mit Geschäftsfortführungs- und Wiederanlaufplänen, das regelmäßig getestet wird; für DORA-Institute über DORA Art. 11–12.",
		"continuity",
		["Verweis auf DORA Art. 11–12", "Übungsnachweise"],
		{
			relatedRequirements: [
				"dora:Art.11(1-2)",
				"dora:Art.11(6)",
				"iso27001:A.5.30",
			],
		},
		140,
	),
	at(
		"AT8",
		"Anpassungsprozesse und Neue-Produkte-Prozess",
		"Vor Aufnahme neuer Produkte, Märkte oder Vertriebswege und vor wesentlichen Änderungen (Organisation, IT, Auslagerung, Fusion) werden Risiken analysiert, Betroffene eingebunden und ein Testkonzept umgesetzt.",
		"governance",
		["NPP-Richtlinie", "Freigabeprotokolle"],
		{
			tools: {
				startup: ["Jira-Workflow", "Klick Workflow change"],
				scale: ["dieselben"],
			},
			relatedRequirements: [
				"iso27001:6.3",
				"iso27001:A.8.32",
				"dora:Art.8(1-4)",
			],
		},
		150,
	),
	at(
		"AT9",
		"Auslagerung",
		"Wesentliche Auslagerungen werden auf Basis einer Risikoanalyse vertraglich geregelt, gesteuert und überwacht; die Verantwortung bleibt beim Institut; wesentliche Auslagerungen werden angezeigt, ein zentrales Auslagerungsmanagement/-beauftragte:r besteht.",
		"supplier",
		["Auslagerungsregister", "Risikoanalysen", "BaFin-Anzeigen"],
		{
			tools: {
				startup: ["Klick Dienstleister", "BaFin-MVP"],
				scale: ["OneTrust TPRM", "Mitratech Prevalent"],
			},
			relatedRequirements: [
				"dora:Art.28(1-2)",
				"dora:Art.28(4-6)",
				"dora:Art.30",
				"iso27001:A.5.19",
			],
		},
		160,
	),

	// ── Besonderer Teil ─────────────────────────────────────────────────────
	{
		code: "BTO1",
		sectionCode: "BT",
		title: "Sicherung der Kundengelder",
		requirementText:
			"Kundengelder werden nach §§ 17–18 ZAG gesichert: Treuhandvertrag, Eingänge direkt auf das Treuhandkonto, keine Eigenmittel darauf, tägliche Abstimmung durch eine Stelle außerhalb des Betriebsbereichs, Insolvenzfestigkeit sichergestellt.",
		guidance:
			"Treuhandkonto bei einem CRR-Kreditinstitut; Reconciliation mit Vier-Augen und Eskalation.",
		domain: "custody",
		appliesToRoles: [...FE],
		evidenceHints: ["Treuhandvertrag", "tägliche Reconciliation-Nachweise"],
		tools: {
			startup: [
				"Treuhandkonto (z. B. Banking Circle, Varengold)",
				"eigene Ledger-Logik",
			],
			scale: ["Kyriba", "Fragment"],
		},
		relatedRequirements: ["iso27001:A.5.34"],
		recommendations: [
			{
				level: "must",
				text: "Abstimmung täglich und durch eine Stelle außerhalb des operativen Betriebsbereichs — kein Selbstabgleich der Zahlungsabteilung.",
				source: "BaFin",
			},
		],
		sortOrder: 200,
	},
	{
		code: "BTO2",
		sectionCode: "BT",
		title:
			"Betrugsprävention, Sicherheitsvorfälle, sicherheitsrelevante Kundenbeschwerden",
		requirementText:
			"Das Institut verfügt über Verfahren zur Betrugsprävention, zur Behandlung sicherheitsrelevanter Vorfälle und Kundenbeschwerden sowie eine Kontaktstelle für Kunden.",
		domain: "fraud",
		appliesToRoles: [...FE],
		evidenceHints: ["Fraud-Konzept", "Beschwerderegister", "Kontaktstelle"],
		tools: {
			startup: ["SEON", "Sardine", "Zendesk"],
			scale: ["Featurespace", "Feedzai", "Freshdesk"],
		},
		relatedRequirements: ["dora:Art.17", "iso27001:A.5.24"],
		sortOrder: 210,
	},
	{
		code: "BTO3",
		sectionCode: "BT",
		title: "Einsatz von Agenten",
		requirementText:
			"Werden Agenten eingesetzt (§ 25 ZAG), bestehen Verträge, Auswahl- und Kontrollverfahren, Schulung und Anzeige; das Institut haftet für die Agenten.",
		domain: "payments",
		appliesToRoles: [...FE],
		evidenceHints: ["Agentenverträge", "Kontrollnachweise"],
		sortOrder: 220,
	},
	{
		code: "BTR1",
		sectionCode: "BT",
		title: "Operationelle Risiken",
		requirementText:
			"Operationelle Risiken (wichtigste Risikoart) werden mindestens jährlich identifiziert und beurteilt; bedeutende Schadensfälle werden zeitnah analysiert, erfasst und an das Risikocontrolling berichtet.",
		domain: "risk",
		appliesToRoles: [...FE],
		evidenceHints: ["Schadensfalldatenbank", "Risk-Self-Assessments"],
		tools: {
			startup: ["Klick Schadensfälle"],
			scale: ["avedos risk2value", "OneTrust"],
		},
		relatedRequirements: ["dora:Art.13(1-5)", "iso27001:10.2"],
		sortOrder: 230,
	},
	{
		code: "BTR2",
		sectionCode: "BT",
		title: "Adressenausfallrisiken",
		requirementText:
			"Adressenausfallrisiken (z. B. gegenüber Banken, Liquiditätspartnern, Kunden mit Vorleistung) werden durch Limite begrenzt, Konzentrationen überwacht und Sicherheiten bewertet.",
		domain: "risk",
		appliesToRoles: [...FE],
		evidenceHints: ["Limitsystem", "Limitüberwachung"],
		tools: { startup: ["Excel-Modell"], scale: ["Treasury-Tool"] },
		sortOrder: 240,
	},
	{
		code: "BTR3",
		sectionCode: "BT",
		title: "Marktpreisrisiken",
		requirementText:
			"Marktpreisrisiken — einschließlich Krypto- und Stablecoin-Bestände — werden begrenzt, laufend bewertet und überwacht; Limitüberschreitungen werden eskaliert.",
		domain: "risk",
		appliesToRoles: [...FE],
		evidenceHints: ["Limitüberwachung", "Bewertungsnachweise"],
		tools: {
			startup: ["Fireblocks Treasury", "Kaiko"],
			scale: ["Copper", "CoinMetrics"],
		},
		sortOrder: 250,
	},
	{
		code: "BTR4",
		sectionCode: "BT",
		title: "Liquiditätsrisiken",
		requirementText:
			"Das Institut stellt sicher, dass es seine Zahlungsverpflichtungen jederzeit erfüllen kann; es verfügt über eine Liquiditätsplanung, einen mehrjährigen Finanzierungsplan und Verfahren für Liquiditätsengpässe.",
		domain: "risk",
		appliesToRoles: [...FE],
		evidenceHints: ["Liquiditätsplanung", "Finanzierungsplan"],
		tools: { startup: ["Agicap"], scale: ["Kyriba"] },
		sortOrder: 260,
	},
	{
		code: "BT2",
		sectionCode: "BT",
		title: "Interne Revision — Prüfungsplanung und Berichte",
		requirementText:
			"Die Interne Revision plant risikoorientiert (Mehrjahresplan), berichtet je Prüfung und jährlich zusammenfassend an die Geschäftsleitung und verfolgt die Behebung von Feststellungen nach.",
		domain: "governance",
		appliesToRoles: [...FE],
		evidenceHints: ["Prüfungsplan", "Revisionsberichte", "Findings-Tracking"],
		tools: { startup: ["Klick Audits"], scale: ["Audimex", "TeamMate+"] },
		relatedRequirements: ["iso27001:9.2", "dora:Art.6(6)"],
		sortOrder: 270,
	},
	{
		code: "BT3",
		sectionCode: "BT",
		title: "Risikoberichterstattung",
		requirementText:
			"Die Geschäftsleitung erhält regelmäßig (mindestens jährlich) und bei Bedarf ad hoc einen Risikobericht über die wesentlichen Risiken, Limitauslastung, Schadensfälle und Maßnahmen; das Aufsichtsorgan wird informiert.",
		domain: "risk",
		appliesToRoles: [...FE],
		evidenceHints: ["Risikobericht an GL und Aufsichtsorgan"],
		tools: {
			startup: ["Klick Überblick/Export"],
			scale: ["Power BI", "GRC-Reporting"],
		},
		relatedRequirements: ["iso27001:9.3", "dora:Art.6(5)"],
		sortOrder: 280,
	},

	// ── Ergänzend ───────────────────────────────────────────────────────────
	{
		code: "EBA-GL-2025-02",
		sectionCode: "ERG",
		title: "EBA-Leitlinien zu IKT- und Sicherheitsrisiken außerhalb DORA",
		requirementText:
			"Für PSD2-Aspekte, die DORA nicht abdeckt, gelten die EBA-Leitlinien zu IKT- und Sicherheitsrisiken ergänzend; das Institut prüft die Abgrenzung und dokumentiert die Umsetzung.",
		domain: "operations",
		appliesToRoles: [...FE],
		legalBasisRefs: ["EBA/GL/2025/02"],
		evidenceHints: ["Abgrenzungsvermerk", "Mapping"],
		relatedRequirements: ["dora:Art.9(1)"],
		sortOrder: 300,
	},

	// ── Historie ────────────────────────────────────────────────────────────
	{
		code: "ZAIT",
		sectionCode: "HIST",
		title: "ZAIT (aufgehoben 16.01.2025)",
		requirementText:
			"Die Zahlungsdiensteaufsichtlichen Anforderungen an die IT wurden mit Ablauf des 16.01.2025 aufgehoben; IT-Anforderungen folgen aus DORA.",
		domain: "operations",
		legalStatus: "repealed",
		effectiveUntil: "2025-01-16",
		evidenceHints: [],
		sortOrder: 400,
	},
	{
		code: "BAIT",
		sectionCode: "HIST",
		title: "BAIT (für DORA-Institute nicht anwendbar, Aufhebung 31.12.2026)",
		requirementText:
			"Die Bankaufsichtlichen Anforderungen an die IT sind für DORA-pflichtige Institute seit 17.01.2025 nicht mehr anwendbar und werden mit Ablauf des 31.12.2026 vollständig aufgehoben; die BaFin-Aufsichtsmitteilung „Hinweise zur Umsetzung von DORA“ dient als Mapping-Hilfe.",
		domain: "operations",
		legalStatus: "repealed",
		effectiveUntil: "2026-12-31",
		evidenceHints: [],
		sortOrder: 410,
	},
];
