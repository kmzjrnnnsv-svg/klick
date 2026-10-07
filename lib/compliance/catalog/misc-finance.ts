import type { CatalogRequirement, CatalogSection } from "./types";

// Kleine Rahmenwerke: DAC8 (KStTG), AWV/Zahlungsverkehrsstatistik, Kassenrecht.
// Authoring-Quelle: docs/regulatory/anforderungskatalog-2026-10.md und
// Businessplan 18.6. Paraphrasen, kein Rechtsrat.

const FE = ["financial_entity"] as const;

export const DAC8_SECTIONS: CatalogSection[] = [
	{ code: "DAC8", title: "Kryptowerte-Steuertransparenzgesetz", sortOrder: 10 },
];

export const DAC8_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "KStTG-Reg",
		sectionCode: "DAC8",
		title: "Registrierung als meldender Kryptowerte-Dienstleister",
		requirementText:
			"Meldende Kryptowerte-Dienstleister registrieren sich beim Bundeszentralamt für Steuern und halten die Registrierungsdaten aktuell.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["BZSt-Registrierung"],
		sortOrder: 10,
	},
	{
		code: "KStTG-§9",
		sectionCode: "DAC8",
		title: "Sorgfaltspflichten und Selbstauskünfte",
		requirementText:
			"Nutzer werden identifiziert und ihre steuerliche Ansässigkeit über Selbstauskünfte erhoben und plausibilisiert; die Sorgfaltspflichten greifen für alle meldepflichtigen Nutzer.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Selbstauskünfte", "Plausibilisierungsnachweise"],
		relatedRequirements: ["gwg:§10"],
		sortOrder: 20,
	},
	{
		code: "KStTG-§17",
		sectionCode: "DAC8",
		title: "Jährliche Meldung an das BZSt",
		requirementText:
			"Meldepflichtige Transaktionen (Tausch, Transfers, Zahlungen) werden je Nutzer aggregiert und bis zum 31. Juli des Folgejahres elektronisch an das BZSt gemeldet (Erstmeldung 31.07.2027 für 2026).",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Meldebelege"],
		sortOrder: 30,
	},
	{
		code: "KStTG-Info",
		sectionCode: "DAC8",
		title: "Information der Nutzer",
		requirementText:
			"Nutzer werden vor der ersten Meldung über Zweck, Umfang und Empfänger der Datenübermittlung informiert; Aufzeichnungen zu den Sorgfaltspflichten werden aufbewahrt.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Nutzerinformation", "Aufbewahrungsnachweise"],
		sortOrder: 40,
	},
];

export const AWV_SECTIONS: CatalogSection[] = [
	{ code: "AWV", title: "Außenwirtschaft und Statistik", sortOrder: 10 },
];

export const AWV_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "AWV-§67",
		sectionCode: "AWV",
		title: "Meldung grenzüberschreitender Zahlungen",
		requirementText:
			"Zahlungen von und an Gebietsfremde über 50 000 € (oder Gegenwert) werden monatlich bis zum 7. des Folgemonats der Bundesbank gemeldet (Z4-Meldung); Ausnahmen (Warenein-/ausfuhr, kurzfristige Kredite) werden geprüft.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Meldebelege"],
		tools: { startup: ["Bundesbank-ExtraNet"], scale: ["Regnology"] },
		sortOrder: 10,
	},
	{
		code: "ZVS",
		sectionCode: "AWV",
		title: "Zahlungsverkehrsstatistik",
		requirementText:
			"Zahlungsdienstleister melden der Bundesbank halbjährlich statistische Daten zum Zahlungsverkehr nach der EZB-Verordnung über Zahlungsverkehrsstatistiken.",
		domain: "compliance",
		appliesToRoles: [...FE],
		legalBasisRefs: ["VO (EU) 2020/2011"],
		evidenceHints: ["Meldebelege"],
		sortOrder: 20,
	},
];

export const KASSEN_SECTIONS: CatalogSection[] = [
	{
		code: "KAS",
		title: "Händlerkasse: KassenSichV, § 146a AO, DSFinV-K, GoBD",
		sortOrder: 10,
	},
];

export const KASSEN_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "AO-§146a(1)",
		sectionCode: "KAS",
		title: "Zertifizierte technische Sicherheitseinrichtung (TSE)",
		requirementText:
			"Elektronische Aufzeichnungssysteme protokollieren jeden Vorgang einzeln, vollständig, richtig, zeitgerecht und geordnet und schützen die Aufzeichnungen durch eine zertifizierte technische Sicherheitseinrichtung (Sicherheitsmodul, Speichermedium, einheitliche digitale Schnittstelle).",
		domain: "payments",
		evidenceHints: ["TSE-Zertifikat", "Konfiguration"],
		tools: { startup: ["fiskaly", "Swissbit TSE"], scale: ["dieselben"] },
		relatedRequirements: ["iso27001:A.8.15"],
		sortOrder: 10,
	},
	{
		code: "DSFinV-K",
		sectionCode: "KAS",
		title: "Digitale Schnittstelle der Finanzverwaltung für Kassensysteme",
		requirementText:
			"Kassendaten sind jederzeit im DSFinV-K-Format exportierbar, damit die Finanzverwaltung sie bei Kassen-Nachschau und Außenprüfung auswerten kann.",
		domain: "payments",
		evidenceHints: ["DSFinV-K-Testexport"],
		sortOrder: 20,
	},
	{
		code: "AO-§146a(2)",
		sectionCode: "KAS",
		title: "Belegausgabepflicht",
		requirementText:
			"Jedem Geschäftsvorfall wird unmittelbar ein Beleg erstellt und dem Kunden zur Verfügung gestellt (Papier oder elektronisch) mit den Pflichtangaben einschließlich TSE-Signaturdaten.",
		domain: "payments",
		evidenceHints: ["Belegausgabe-Konfiguration", "Musterbeleg"],
		sortOrder: 30,
	},
	{
		code: "AO-§146a(4)",
		sectionCode: "KAS",
		title: "Mitteilungspflicht der Kassensysteme",
		requirementText:
			"Art und Anzahl der eingesetzten elektronischen Aufzeichnungssysteme und TSE werden dem Finanzamt elektronisch mitgeteilt (Anschaffung, Außerbetriebnahme, Änderungen innerhalb eines Monats).",
		domain: "payments",
		evidenceHints: ["Kassenmeldung (ELSTER)"],
		sortOrder: 40,
	},
	{
		code: "GoBD",
		sectionCode: "KAS",
		title: "GoBD-Verfahrensdokumentation",
		requirementText:
			"Eine Verfahrensdokumentation beschreibt Aufbau, Ablauf, Kontrollen und Archivierung des Kassensystems so, dass ein sachverständiger Dritter es in angemessener Zeit nachvollziehen kann; Änderungen werden versioniert.",
		domain: "compliance",
		evidenceHints: ["Verfahrensdokumentation"],
		relatedRequirements: ["iso27001:7.5"],
		sortOrder: 50,
	},
	{
		code: "RegKassen-2028",
		sectionCode: "KAS",
		title: "Registrierkassenpflicht (Entwurf)",
		requirementText:
			"Eine allgemeine Pflicht zum Einsatz elektronischer Aufzeichnungssysteme ab 01.01.2028 ist im Entwurf; Händlerprodukte sollten darauf vorbereitet sein.",
		domain: "payments",
		effectiveFrom: "2028-01-01",
		legalStatus: "draft",
		evidenceHints: ["Horizon-Scanning-Vermerk"],
		sortOrder: 60,
	},
];
